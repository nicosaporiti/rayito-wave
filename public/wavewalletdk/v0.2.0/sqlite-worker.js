// Dedicated SQLite worker using the supported sqlite3.oo1 API directly.
//
// This file runs in two very different workers: a browser Web Worker, where
// SQLite persists through OPFS, and a node:worker_threads worker, where it
// persists through the node:fs VFS in sqlite-node-vfs.js. The two hosts differ
// in how scripts load, how the wasm binary is fetched, and how messages cross
// the thread boundary, so each of those three seams is behind a small
// abstraction rather than being sprinkled through the request handlers.

const workerProtocolVersion = 1;
let sqlite3;
let nextDbId = 1;
const dbs = new Map();
const openPersistentFiles = new Map();
let sqliteJSURL = "sqlite3.js";

// isNodeWorker reports whether we are running under node:worker_threads. A
// browser Worker has importScripts and no Node process object, so the two
// hosts are cleanly distinguishable.
const isNodeWorker =
  typeof globalThis.process === "object" &&
  !!globalThis.process?.versions?.node &&
  typeof globalThis.importScripts !== "function";

// nodeParentPort and nodeAssetDir are the Node-only handles: the message
// channel back to the bridge, and the directory the bridge told us the runtime
// assets live in. Both are undefined in a browser.
let nodeParentPort;
let nodeAssetDir = "";

// nodeVfsUtil is the handle returned when the node:fs VFS is installed. It is
// how the worker asks the VFS questions SQLite will not answer, such as which
// process is holding a database it just failed to open.
let nodeVfsUtil = null;
if (isNodeWorker) {
  const workerThreads = require("node:worker_threads");
  nodeParentPort = workerThreads.parentPort;
  nodeAssetDir = workerThreads.workerData?.assetDir || process.cwd();
}

// PERSISTENT_VFS_NAMES are the VFS names that promise durable storage. Naming
// one of these explicitly is a request this worker will never quietly satisfy
// with memory instead.
const PERSISTENT_VFS_NAMES = new Set([
  "opfs",
  "opfs-wl",
  "opfs-sahpool",
  "nodefs",
]);

function normalizeError(error) {
  if (!error) return "unknown sqlite worker error";
  if (error.stack) return error.stack;
  if (error.message) return error.message;
  return String(error);
}

function vfsList() {
  return sqlite3.capi.sqlite3_js_vfs_list();
}

function hasVFS(name) {
  return !!sqlite3.capi.sqlite3_vfs_find(name);
}

// loadSQLiteInBrowser loads sqlite3.js the way a Web Worker does, letting
// Emscripten fetch sqlite3.wasm over the network relative to that script.
async function loadSQLiteInBrowser() {
  importScripts(sqliteJSURL);
  return sqlite3InitModule();
}

// loadSQLiteInNode loads sqlite3.js off disk. Emscripten's default loader
// would fetch() the wasm binary by relative URL, which Node cannot resolve
// into an absolute one, so the binary is handed over directly instead.
async function loadSQLiteInNode() {
  const nodeFS = require("node:fs");
  const nodePath = require("node:path");

  const jsPath = nodePath.isAbsolute(sqliteJSURL)
    ? sqliteJSURL
    : nodePath.join(nodeAssetDir, sqliteJSURL);
  const wasmPath = nodePath.join(nodePath.dirname(jsPath), "sqlite3.wasm");

  // Every OPFS VFS needs browser APIs that do not exist here, and sqlite3.js
  // reports each failed install as a stack trace on stderr. Turning them off
  // up front keeps a normal Node startup quiet, so a warning that does appear
  // is worth reading.
  globalThis.sqlite3ApiConfig = Object.assign(
    {},
    globalThis.sqlite3ApiConfig,
    {
      disable: {
        vfs: {
          opfs: true,
          "opfs-vfs": true,
          "opfs-sahpool": true,
          "opfs-wl": true,
        },
      },
    }
  );

  const init = require(jsPath);
  return init({
    instantiateWasm(imports, onSuccess) {
      const bytes = nodeFS.readFileSync(wasmPath);
      WebAssembly.instantiate(bytes, imports).then((result) => {
        onSuccess(result.instance, result.module);
      });
      return {};
    },
  });
}

async function ensureSQLite(options = {}) {
  if (sqlite3) return sqlite3;

  sqliteJSURL = options.sqliteJSURL || sqliteJSURL;
  sqlite3 = isNodeWorker
    ? await loadSQLiteInNode()
    : await loadSQLiteInBrowser();

  if (isNodeWorker) {
    // Node has a real filesystem, so the durable VFS is installed eagerly and
    // its absence is fatal rather than something to warn about: there is no
    // second durable option to fall through to here.
    const nodePath = require("node:path");
    const { installNodeFsVfs } = require(
      nodePath.join(nodeAssetDir, "sqlite-node-vfs.js")
    );
    nodeVfsUtil = installNodeFsVfs(sqlite3, {
      directory: options.rootDir || undefined,
    });

    return sqlite3;
  }

  if (sqlite3.installOpfsSAHPoolVfs && !hasVFS("opfs-sahpool")) {
    await sqlite3.installOpfsSAHPoolVfs({ name: "opfs-sahpool" }).catch((error) => {
      sqlite3.config.warn("Ignoring inability to install opfs-sahpool:", error.message);
    });
  }

  return sqlite3;
}

function openFlags(mode) {
  switch ((mode || "rwc").toLowerCase()) {
    case "ro":
      return "r";
    case "rw":
      return "w";
    case "rwc":
    case "memory":
    default:
      return "c";
  }
}

function normalizeFilename(file) {
  if (!file || file === ":memory:") return ":memory:";
  return file;
}

function normalizeRequestedVFS(vfs) {
  switch ((vfs || "auto").toLowerCase()) {
    case "":
    case "auto":
    case "opfs-auto":
      return "auto";
    case "opfs-sah":
    case "sahpool":
      return "opfs-sahpool";
    case "node":
    case "node-fs":
    case "nodefs":
      return "nodefs";
    default:
      return vfs;
  }
}

// autoVFSCandidates lists the durable VFSes to try, best first, when the
// caller did not name one. The lists do not overlap because no host offers
// both OPFS and node:fs.
function autoVFSCandidates() {
  return isNodeWorker ? ["nodefs"] : ["opfs-wl", "opfs-sahpool", "opfs"];
}

// normalizePersistentFilename adapts a caller's filename to what the target
// VFS expects. OPFS wants an origin-local path rooted at "/", while the
// node:fs VFS resolves names against a real directory and must be left alone:
// forcing a leading slash there would rewrite every relative database name
// into one at the filesystem root.
function normalizePersistentFilename(vfsName, file) {
  if (vfsName === "nodefs") return file;
  if (file.startsWith("/") || file.startsWith("file:")) return file;
  return `/${file}`;
}

function makeURI(filename, params) {
  const pairs = [];
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "") continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  if (!pairs.length) return filename;
  const sep = filename.includes("?") ? "&" : "?";
  return `${filename}${sep}${pairs.join("&")}`;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Uint8Array) {
    let hex = "";
    for (const byte of value) hex += byte.toString(16).padStart(2, "0");
    return `X'${hex}'`;
  }
  if (value instanceof ArrayBuffer) return sqlLiteral(new Uint8Array(value));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeValue(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "__wasmSqliteInt64")) {
    return BigInt(value.__wasmSqliteInt64);
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    if (Number.isSafeInteger(asNumber)) return asNumber;
    return value.toString();
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return value;
}

function stripParamPrefix(name) {
  return String(name || "").replace(/^[:@$]/, "");
}

function normalizeNamedParams(stmt, params) {
  const normalized = Object.create(null);
  const usedKeys = new Set();

  for (let i = 1; i <= stmt.parameterCount; i++) {
    const bindName = stmt.getParamName(i);
    if (!bindName) continue;

    const bareName = stripParamPrefix(bindName);
    let value;
    let matchedKey = "";
    for (const candidate of [bindName, bareName, `:${bareName}`, `$${bareName}`, `@${bareName}`]) {
      if (Object.prototype.hasOwnProperty.call(params, candidate)) {
        value = params[candidate];
        matchedKey = candidate;
        break;
      }
    }
    if (!matchedKey) {
      throw new Error(`missing named SQL parameter: ${bindName}`);
    }

    normalized[bindName] = normalizeValue(value);
    usedKeys.add(matchedKey);
  }

  for (const key of Object.keys(params)) {
    if (!usedKeys.has(key)) {
      throw new Error(`unused named SQL parameter: ${key}`);
    }
  }

  return normalized;
}

function numericParamIndex(name) {
  const match = String(name || "").match(/^[:@$?]([1-9][0-9]*)$/);
  if (!match) return 0;
  return Number(match[1]);
}

function normalizePositionalParams(stmt, params) {
  if (!params.length) return params;

  const normalized = [];
  const usedParamIndexes = new Set();

  for (let i = 1; i <= stmt.parameterCount; i++) {
    const bindName = stmt.getParamName(i);
    const numericIndex = numericParamIndex(bindName);
    const paramIndex = numericIndex ? numericIndex - 1 : i - 1;

    if (paramIndex < 0 || paramIndex >= params.length) {
      throw new Error(`missing SQL parameter for ${bindName || `?${i}`}`);
    }

    normalized.push(normalizeValue(params[paramIndex]));
    usedParamIndexes.add(paramIndex);
  }

  for (let i = 0; i < params.length; i++) {
    if (!usedParamIndexes.has(i)) {
      throw new Error(`unused SQL parameter at index ${i + 1}`);
    }
  }

  return normalized;
}

function bindParams(stmt, params) {
  if (!params) return;
  if (Array.isArray(params)) {
    if (!params.length) return;
    stmt.bind(normalizePositionalParams(stmt, params));
    return;
  }

  if (typeof params === "object") {
    const keys = Object.keys(params);
    if (!keys.length) return;
    stmt.bind(normalizeNamedParams(stmt, params));
    return;
  }

  throw new Error("invalid SQL parameter container");
}

function getDB(dbId) {
  const db = dbs.get(dbId);
  if (!db) throw new Error(`database is not open: ${dbId}`);
  return db;
}

function runQuery(db, sql, params) {
  const stmt = db.prepare(sql);
  try {
    bindParams(stmt, params);
    const columnNames = stmt.columnCount ? stmt.getColumnNames([]) : [];
    const resultRows = [];
    while (stmt.step()) {
      const row = stmt.get([]);
      resultRows.push(row.map(normalizeValue));
    }
    return { columnNames, resultRows };
  } finally {
    stmt.finalize();
  }
}

function runExec(db, sql, params) {
  const beforeChanges = db.changes(true);
  // Route any non-empty params (positional array OR named object) through
  // bindParams, exactly like runQuery. bindParams sends positional arrays to
  // normalizePositionalParams, which remaps each $N to its slot BY NUMBER.
  // db.exec({ bind: [...] }) would instead bind the array by SQLite slot order
  // (i.e. order of first appearance), silently mis-binding any statement whose
  // $N are out of textual order -- e.g. UPDATE ... SET col = $3 WHERE k = $1
  // binds k against the value meant for col and matches zero rows. Only the
  // empty-params case falls through to db.exec.
  const hasParams =
    params && (Array.isArray(params) ? params.length : Object.keys(params).length);
  if (hasParams) {
    const stmt = db.prepare(sql);
    try {
      bindParams(stmt, params);
      while (stmt.step()) {}
    } finally {
      stmt.finalize();
    }
  } else {
    db.exec({ sql });
  }

  return {
    rowsAffected: db.changes(true) - beforeChanges,
    lastInsertId: Number(sqlite3.capi.sqlite3_last_insert_rowid(db.pointer))
  };
}

function runExecBatch(db, sql, paramRows, options = {}) {
  if (!Array.isArray(paramRows)) {
    throw new Error("batch parameter rows must be an array");
  }

  if (paramRows.length === 0) {
    return {
      rowsAffected: 0,
      lastInsertId: Number(sqlite3.capi.sqlite3_last_insert_rowid(db.pointer)),
      batchCount: 0
    };
  }

  const beforeChanges = db.changes(true);
  const useTransaction = options.transaction !== false;
  let stmt;
  let committed = false;

  try {
    if (useTransaction) db.exec("BEGIN IMMEDIATE");

    stmt = db.prepare(sql);
    for (const params of paramRows) {
      bindParams(stmt, params || []);
      while (stmt.step()) {}
      stmt.reset(true);
    }

    if (useTransaction) {
      db.exec("COMMIT");
      committed = true;
    }

    return {
      rowsAffected: db.changes(true) - beforeChanges,
      lastInsertId: Number(sqlite3.capi.sqlite3_last_insert_rowid(db.pointer)),
      batchCount: paramRows.length
    };
  } catch (error) {
    if (useTransaction && !committed) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {}
    }
    throw error;
  } finally {
    if (stmt) stmt.finalize();
  }
}

async function init(args = {}) {
  if (args.expectedBridgeProtocolVersion && args.expectedBridgeProtocolVersion !== workerProtocolVersion) {
    throw new Error(`SQLite bridge protocol mismatch: expected ${workerProtocolVersion}, got ${args.expectedBridgeProtocolVersion}`);
  }
  await ensureSQLite(args);
  return { version: sqlite3.version, vfsList: vfsList(), workerProtocolVersion };
}

// annotateLockedOpen replaces a failed nodefs open with one that names the
// process holding the database, when that is what went wrong.
//
// SQLite reports a lock collision as a bare SQLITE_CANTOPEN, the same code it
// uses for a missing directory or a permissions failure, and the message the
// VFS wrote is only reachable through xGetLastError, which the core does not
// consult. Left alone, a second daemon pointed at one data directory dies with
// "unable to open database file" and sends whoever is on call looking at file
// permissions. The lock file knows better, so ask it.
function annotateLockedOpen(vfsName, filename, error) {
  if (vfsName !== "nodefs" || !nodeVfsUtil) {
    return error;
  }

  let holder = null;
  try {
    holder = nodeVfsUtil.lockHolder(filename);
  } catch (_) {
    return error;
  }

  if (!holder) {
    return error;
  }

  const locked = new Error(
    `database is locked by another process (pid ${holder.pid}): ${filename}`
  );
  locked.sqliteLockHolderPid = holder.pid;
  locked.cause = error;

  return locked;
}

async function openPersistentDB(vfsName, filename, uriParams, args) {
  if (vfsName === "opfs-sahpool" && sqlite3.installOpfsSAHPoolVfs && !hasVFS("opfs-sahpool")) {
    await sqlite3.installOpfsSAHPoolVfs({ name: "opfs-sahpool" });
  }
  if (!hasVFS(vfsName)) {
    throw new Error(`requested SQLite VFS is unavailable: ${vfsName}`);
  }

  let resolvedFilename = normalizePersistentFilename(vfsName, filename);
  const resolved = makeURI(resolvedFilename, uriParams);
  const duplicateKey = `${vfsName}:${resolved}`;
  if (openPersistentFiles.has(duplicateKey)) {
    throw new Error(`database already open in this worker: ${resolved}`);
  }

  let db;
  try {
    if (vfsName === "opfs" && sqlite3.oo1.OpfsDb) {
      db = new sqlite3.oo1.OpfsDb(resolved, openFlags(args.mode));
    } else {
      db = new sqlite3.oo1.DB({ filename: resolved, flags: openFlags(args.mode), vfs: vfsName });
    }
  } catch (error) {
    throw annotateLockedOpen(vfsName, resolvedFilename, error);
  }

  resolvedFilename = db.dbFilename();
  const vfs = db.dbVfsName() || vfsName;
  openPersistentFiles.set(duplicateKey, true);
  db.__persistentKey = duplicateKey;

  return { db, filename: resolvedFilename, vfs, persistent: true };
}

// orderPragmas puts any locking_mode pragma at the front and otherwise
// preserves the caller's order.
//
// Callers reasonably think of locking_mode as one setting among several and
// list it wherever it reads well. On a VFS without shared memory it is not
// one setting among several: it is the precondition for touching a WAL
// database at all. Rather than make every caller know that, the driver, which
// is the part that knows its VFSes have no xShmMap, hoists it.
function orderPragmas(pragmas) {
  const isLockingMode = (pragma) =>
    /^\s*locking_mode\s*=/i.test(String(pragma));

  return [
    ...pragmas.filter(isLockingMode),
    ...pragmas.filter((pragma) => !isLockingMode(pragma)),
  ];
}

// extractJournalMode pulls a journal_mode pragma out of the caller's list and
// returns it alongside the pragmas that remain.
//
// The journal mode cannot be applied as an ordinary pragma, because the mode
// SQLite ends up in and the mode it was asked for are allowed to differ and
// only applyJournalMode looks. The pragma list is the natural place to write
// it, being where every other pragma goes, so a caller who does that would get
// precisely the silent downgrade the readback exists to refuse. Routing it to
// the checked path is kinder than rejecting it and gives the same answer.
function extractJournalMode(pragmas, journalMode) {
  const isJournalMode = (pragma) =>
    /^\s*journal_mode\s*=/i.test(String(pragma));

  const found = pragmas.filter(isJournalMode);
  if (!found.length) {
    return { pragmas, journalMode };
  }

  // Last one wins, matching what SQLite would have done had these run as
  // ordinary pragmas in order.
  const requested = String(found[found.length - 1]).split("=")[1].trim();
  if (journalMode && journalMode.toLowerCase() !== requested.toLowerCase()) {
    throw new Error(
      `conflicting journal modes: "${journalMode}" was requested as an ` +
        `option and "${requested}" as a pragma`
    );
  }

  return {
    pragmas: pragmas.filter((pragma) => !isJournalMode(pragma)),
    journalMode: journalMode || requested,
  };
}

// releaseOpened closes a database that was opened but never handed out, and
// drops the duplicate-open bookkeeping that goes with it.
function releaseOpened(opened) {
  try {
    if (opened.db.__persistentKey) {
      openPersistentFiles.delete(opened.db.__persistentKey);
    }
    opened.db.close();
  } catch (closeError) {
    sqlite3.config.warn(
      "failed to close a database after a failed open:",
      closeError.message || String(closeError)
    );
  }
}

// applyJournalMode sets the requested journal mode and then proves it took.
//
// SQLite answers a journal mode it cannot honor by quietly leaving the
// database in the mode it was already in, and PRAGMA journal_mode reports the
// mode in force rather than the mode asked for. A caller that asks for WAL on
// a VFS or a locking mode that cannot provide it therefore runs on the
// rollback journal while believing otherwise, and durability settings chosen
// for WAL do not mean the same thing there: synchronous=NORMAL loses only the
// recent tail under WAL, but risks a corrupt database under the rollback
// journal. Reading the mode back turns that class of mistake into a startup
// error, in the same spirit as refusing to substitute memory for durable
// storage.
function applyJournalMode(opened, requested) {
  if (!requested) {
    return;
  }

  opened.db.exec(`PRAGMA journal_mode=${requested}`);

  // An in-memory database is always in "memory" journal mode and cannot be
  // moved out of it. There is no silent downgrade to catch, because there was
  // never any durability on offer to lose.
  if (!opened.persistent) {
    return;
  }

  const effective = String(
    opened.db.selectValue("PRAGMA journal_mode") || ""
  ).toLowerCase();
  if (effective !== requested.toLowerCase()) {
    throw new Error(
      `journal_mode=${requested} was requested but SQLite is in ` +
        `"${effective}" mode on VFS ${opened.vfs}; refusing to run with ` +
        `weaker guarantees than the caller asked for`
    );
  }
}

function openMemoryDB(args) {
  if (args.requirePersistent) {
    throw new Error("persistent storage required but memory VFS was requested");
  }
  return {
    db: new sqlite3.oo1.DB(":memory:", openFlags(args.mode)),
    filename: ":memory:",
    vfs: "memory",
    persistent: false
  };
}

async function open(args) {
  await ensureSQLite();

  const requestedVFS = normalizeRequestedVFS(args.vfs);
  let filename = normalizeFilename(args.file || args.filename || "/app.db");
  let opened;

  const uriParams = {};
  if (args.cache) uriParams.cache = args.cache;

  if (filename === ":memory:" || requestedVFS === "memory") {
    opened = openMemoryDB(args);
  } else {
    const candidates = requestedVFS === "auto"
      ? autoVFSCandidates()
      : [requestedVFS];
    const failures = [];
    for (const candidate of candidates) {
      try {
        opened = await openPersistentDB(candidate, filename, uriParams, args);
        break;
      } catch (error) {
        failures.push(`${candidate}: ${error.message || String(error)}`);
        if (/already open/i.test(error.message || "")) {
          throw error;
        }
        if (requestedVFS !== "auto") {
          throw error;
        }
      }
    }
    if (!opened) {
      // Naming a durable VFS, or asking for persistence outright, is a
      // promise this worker keeps or breaks loudly. Substituting memory here
      // would let a caller run happily against storage that evaporates on
      // exit, which for a wallet database means losing state that is not
      // recoverable from anywhere else.
      if (args.requirePersistent || PERSISTENT_VFS_NAMES.has(requestedVFS)) {
        throw new Error(`persistent storage required but no durable VFS opened; tried ${failures.join("; ")}`);
      }
      sqlite3.config.warn("no durable VFS available, falling back to :memory:", failures.join("; "));
      opened = openMemoryDB(args);
    }
  }

  if (args.busyTimeout > 0) {
    sqlite3.capi.sqlite3_busy_timeout(opened.db.pointer, args.busyTimeout);
  }

  // Pragma ordering here is load-bearing rather than cosmetic, and for one
  // reason: none of the VFSes this driver can reach implements xShmMap. That
  // makes SQLite's "WAL without shared memory" mode the only WAL available,
  // and that mode is conditional on the connection already being in
  // locking_mode=EXCLUSIVE. Two things follow.
  //
  // The locking mode goes first, ahead of the caller's other pragmas, because
  // a WAL database cannot even be read by a non-exclusive connection here. A
  // pragma as innocent as auto_vacuum, which reads page 1, fails with
  // SQLITE_CANTOPEN when it runs one statement too early.
  //
  // The journal mode goes last, after the locking mode is in force. Setting
  // it first, as this once did, meant a caller asking for WAL got the
  // rollback journal and no indication that it had.
  try {
    const routed = extractJournalMode(args.pragma || [], args.journalMode);

    for (const pragma of orderPragmas(routed.pragmas)) {
      if (!pragma) continue;
      try {
        opened.db.exec(`PRAGMA ${pragma}`);
      } catch (error) {
        // Name the pragma. SQLite's own message says only what went wrong,
        // and a DSN carries several of these, so without the name a failure
        // here sends the reader looking through all of them.
        throw new Error(
          `PRAGMA ${pragma} failed on ${opened.filename}: ` +
            (error.message || String(error))
        );
      }
    }
    applyJournalMode(opened, routed.journalMode);
  } catch (error) {
    // Configuration failed after the file was opened, so nothing will ever
    // hand this handle back to the caller. Release it here: a database left
    // open holds the VFS's exclusive claim on the file (an OPFS access handle
    // in a browser, a lock file under nodefs) for the lifetime of the worker,
    // which would turn a retry into "already open" and strand the database.
    releaseOpened(opened);
    throw error;
  }

  const dbId = `db${nextDbId++}`;
  dbs.set(dbId, opened.db);

  return { dbId, filename: opened.filename, vfs: opened.vfs, persistent: opened.persistent };
}

async function exec(args) {
  const db = getDB(args.dbId);
  return runExec(db, args.sql, args.params || []);
}

async function execBatch(args) {
  const db = getDB(args.dbId);
  return runExecBatch(db, args.sql, args.paramRows || [], {
    transaction: args.transaction !== false
  });
}

async function query(args) {
  const db = getDB(args.dbId);
  return runQuery(db, args.sql, args.params || []);
}

async function begin(args) {
  getDB(args.dbId).exec("BEGIN IMMEDIATE");
  return {};
}

async function commit(args) {
  getDB(args.dbId).exec("COMMIT");
  return {};
}

async function rollback(args) {
  getDB(args.dbId).exec("ROLLBACK");
  return {};
}

async function close(args) {
  const db = dbs.get(args.dbId);
  if (!db) return {};

  if (db.__persistentKey) openPersistentFiles.delete(db.__persistentKey);
  db.close();
  dbs.delete(args.dbId);
  return {};
}

async function dump(args) {
  const db = getDB(args.dbId);
  let dumpSQL = "BEGIN TRANSACTION;\n";

  const schemaRows = runQuery(
    db,
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, type DESC, name",
    []
  ).resultRows;
  for (const row of schemaRows) {
    dumpSQL += `${row[3]};\n`;
  }

  const tableRows = runQuery(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    []
  ).resultRows;
  for (const [tableName] of tableRows) {
    const columns = runQuery(db, `PRAGMA table_info(${quoteIdentifier(tableName)})`, [])
      .resultRows
      .map((row) => row[1]);
    const rows = runQuery(db, `SELECT * FROM ${quoteIdentifier(tableName)}`, []).resultRows;
    for (const row of rows) {
      dumpSQL += `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${row.map(sqlLiteral).join(", ")});\n`;
    }
  }

  dumpSQL += "COMMIT;\n";
  return { dump: dumpSQL };
}

async function load(args) {
  const db = getDB(args.dbId);
  const tables = runQuery(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    []
  ).resultRows;
  db.exec("PRAGMA foreign_keys=OFF");
  try {
    for (const [tableName] of tables) {
      db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
    }
    db.exec(args.sql || "");
  } catch (error) {
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys=ON");
  }
  return {};
}

const methods = { init, open, exec, execBatch, query, begin, commit, rollback, close, dump, load };

// handleMessage is the host-independent request handler. Both worker flavors
// deliver the same {id, method, args} envelope and expect the same
// {id, ok, result|error} reply; only the transport differs.
async function handleMessage(message = {}) {
  try {
    const method = methods[message.method];
    if (!method) throw new Error(`unknown sqlite worker method: ${message.method}`);
    const result = await method(message.args || {});
    return { id: message.id, ok: true, result };
  } catch (error) {
    return { id: message.id, ok: false, error: normalizeError(error) };
  }
}

if (isNodeWorker) {
  nodeParentPort.on("message", async (message) => {
    nodeParentPort.postMessage(await handleMessage(message || {}));
  });
} else {
  globalThis.onmessage = async (event) => {
    globalThis.postMessage(await handleMessage(event.data || {}));
  };
}
