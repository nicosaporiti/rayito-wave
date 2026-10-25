// Main-thread bridge between Go WASM and the dedicated SQLite oo1 worker.
//
// The worker is a browser Web Worker in a browser and a node:worker_threads
// worker under Node. The two APIs disagree on nearly everything at the seam
// (construction, event delivery, teardown), so the Node side is wrapped in an
// adapter that presents the browser Worker shape and the rest of this file
// stays host-independent.

(() => {
  const bridgeProtocolVersion = 1;
  const expectedWorkerProtocolVersion = 1;
  let worker = null;
  let nextRequestId = 1;
  let initPromise = null;
  const pending = new Map();
  const bridgeScriptURL = globalThis.document?.currentScript?.src || "";

  // isNodeHost reports whether this is Node rather than a browser. Node has no
  // global Worker constructor, which is both the thing that distinguishes it
  // and the exact reason the adapter below has to exist.
  const isNodeHost =
    typeof globalThis.process === "object" &&
    !!globalThis.process?.versions?.node &&
    typeof globalThis.Worker !== "function";

  function workerURL(override) {
    if (override) return override;
    if (globalThis.sqliteBridgeWorkerURL) return globalThis.sqliteBridgeWorkerURL;
    if (bridgeScriptURL) return new URL("sqlite-worker.js", bridgeScriptURL).href;
    return "sqlite-worker.js";
  }

  // nodeAssetDir resolves the directory holding the runtime assets. A host
  // that evaluates this file as a string (which is how a Go WASM host usually
  // loads it) has no __dirname, so sqliteBridgeAssetDir is the supported knob.
  function nodeAssetDir() {
    const nodePath = require("node:path");
    if (globalThis.sqliteBridgeAssetDir) {
      return nodePath.resolve(globalThis.sqliteBridgeAssetDir);
    }
    if (typeof __dirname === "string") return __dirname;
    return process.cwd();
  }

  // createNodeWorker starts the worker under node:worker_threads and adapts it
  // to the browser Worker interface this bridge is written against.
  //
  // The worker source is read and evaluated rather than being handed to Node
  // as a path, because a path is interpreted through the nearest package.json:
  // a ".js" file that lands inside a "type": "module" package would be loaded
  // as ESM and its require() calls would fail. Evaluating the source sidesteps
  // the question entirely, since an eval'd worker is always CommonJS.
  function createNodeWorker(override) {
    const { Worker: NodeWorker } = require("node:worker_threads");
    const nodeFS = require("node:fs");
    const nodePath = require("node:path");

    const assetDir = nodeAssetDir();
    const scriptPath = override
      ? nodePath.resolve(assetDir, override)
      : nodePath.join(assetDir, "sqlite-worker.js");

    let source;
    try {
      source = nodeFS.readFileSync(scriptPath, "utf8");
    } catch (error) {
      throw new Error(
        `unable to read sqlite-worker.js at ${scriptPath}: ${error.message}; ` +
          "set globalThis.sqliteBridgeAssetDir to the runtime asset directory"
      );
    }

    const nodeWorker = new NodeWorker(source, {
      eval: true,
      workerData: { assetDir: nodePath.dirname(scriptPath) },
    });

    const adapter = {
      onmessage: null,
      onerror: null,
      postMessage: (message) => nodeWorker.postMessage(message),
      terminate: () => nodeWorker.terminate(),
    };
    nodeWorker.on("message", (data) => adapter.onmessage?.({ data }));
    nodeWorker.on("error", (error) => adapter.onerror?.(error));

    return adapter;
  }

  function ensureWorker(override) {
    if (worker) return;

    worker = isNodeHost ? createNodeWorker(override) : new Worker(workerURL(override));
    worker.onmessage = (event) => {
      const message = event.data || {};
      const waiter = pending.get(message.id);
      if (!waiter) return;

      pending.delete(message.id);
      if (message.ok) {
        waiter.resolve(message.result || {});
      } else {
        waiter.reject(new Error(message.error || "sqlite worker request failed"));
      }
    };
    worker.onerror = (event) => {
      const err = new Error(event.message || "sqlite worker error");
      for (const waiter of pending.values()) waiter.reject(err);
      pending.clear();
    };
  }

  function request(method, args = {}, transfer = []) {
    if (!worker) throw new Error("SQLite worker is not initialized");

    const id = nextRequestId++;
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    worker.postMessage({ id, method, args }, transfer);
    return promise;
  }

  globalThis.sqliteBridge = {
    protocolVersion: bridgeProtocolVersion,

    async init(options = {}) {
      ensureWorker(options.workerURL);
      if (!initPromise) {
        initPromise = request("init", {
          sqliteJSURL: options.sqliteJSURL || globalThis.sqliteBridgeSQLiteJSURL || "",
          // rootDir anchors relative database names for the node:fs VFS. It is
          // ignored in a browser, where names are origin-local OPFS paths.
          rootDir: options.rootDir || globalThis.sqliteBridgeRootDir || "",
          expectedBridgeProtocolVersion: bridgeProtocolVersion
        }).then((result) => {
          if (result.workerProtocolVersion !== expectedWorkerProtocolVersion) {
            throw new Error(`SQLite worker protocol mismatch: expected ${expectedWorkerProtocolVersion}, got ${result.workerProtocolVersion}`);
          }
          console.log("SQLite oo1 worker initialized:", result.version?.libVersion || "unknown");
          return { ok: true, bridgeProtocolVersion, ...result };
        });
      }
      return initPromise;
    },

    async open(optionsOrFilename = {}, maybeVFS = "opfs") {
      await globalThis.sqliteBridge.init();

      let options = optionsOrFilename;
      if (typeof optionsOrFilename === "string") {
        options = { file: optionsOrFilename, vfs: maybeVFS };
      }

      const result = await request("open", options || {});
      return {
        ok: true,
        dbId: result.dbId,
        filename: result.filename,
        vfsType: result.vfs,
        resolvedVFS: result.vfs,
        persistent: !!result.persistent
      };
    },

    async exec(dbId, sql, params = []) {
      const result = await request("exec", { dbId, sql, params });
      return { ok: true, ...result };
    },

    async execBatch(dbId, sql, paramRows = [], options = {}) {
      const result = await request("execBatch", {
        dbId,
        sql,
        paramRows,
        transaction: options.transaction !== false
      });
      return { ok: true, ...result };
    },

    async query(dbId, sql, params = []) {
      const result = await request("query", { dbId, sql, params });
      return {
        ok: true,
        columns: result.columnNames || [],
        rows: result.resultRows || []
      };
    },

    async begin(dbId) {
      await request("begin", { dbId });
      return { ok: true };
    },

    async commit(dbId) {
      await request("commit", { dbId });
      return { ok: true };
    },

    async rollback(dbId) {
      await request("rollback", { dbId });
      return { ok: true };
    },

    async close(dbId) {
      await request("close", { dbId });
      return { ok: true };
    },

    async dump(dbId) {
      const result = await request("dump", { dbId });
      return { ok: true, dump: result.dump || "" };
    },

    async load(dbId, sql) {
      await request("load", { dbId, sql });
      return { ok: true };
    },

    // shutdown tears the worker down. A browser page discards its workers when
    // it unloads, but a Node worker thread keeps the host process alive, so a
    // short-lived Node program needs a way to say it is finished. Databases
    // should be closed first; this does not flush anything on their behalf.
    async shutdown() {
      if (!worker) return { ok: true };

      const stopping = worker;
      worker = null;
      initPromise = null;
      for (const waiter of pending.values()) {
        waiter.reject(new Error("sqlite worker shut down"));
      }
      pending.clear();
      if (typeof stopping.terminate === "function") {
        await stopping.terminate();
      }
      return { ok: true };
    }
  };
})();
