// A SQLite VFS backed by node:fs, for hosts that run this driver under Node
// instead of a browser.
//
// The browser story is OPFS, which is asynchronous at its core and therefore
// needs either the async proxy worker or the SAH pool's preallocated
// synchronous access handles. Node has none of that problem: node:fs exposes
// genuinely synchronous file operations, which is exactly the shape SQLite's
// VFS layer wants, so this VFS is a thin translation rather than a pooling
// scheme. It is modeled on opfs-sahpool for structure only.
//
// The one property OPFS gives away for free that a plain filesystem does not
// is exclusive access: a SyncAccessHandle cannot be held by two tabs at once.
// A wallet database that two processes write concurrently corrupts silently,
// so this VFS reconstructs that property with a pid-stamped lock file taken
// when a main database is opened for writing. Two Node processes pointed at
// one database fail loudly instead of interleaving writes.
//
// That reconstruction is narrower than the thing it replaces, and the limits
// are worth stating rather than discovering. Node core exposes no flock or
// fcntl, so the claim rests on a file whose contents name the owning process,
// and reading it back is only meaningful where process ids mean the same thing
// to both parties. Concretely:
//
//   - Writers only. A read-only open takes no lock and is not blocked by one.
//   - One pid namespace. Two containers sharing a bind-mounted data directory
//     have unrelated pid numbering, so each would read the other's lock as
//     belonging to a process that does not exist.
//   - Local filesystems. Over NFS or SMB neither the atomicity this relies on
//     nor the pid check holds.
//
// Within a single machine and pid namespace, a recycled pid is handled: the
// lock records the owner's kernel start time where the platform exposes it, so
// a reused pid number does not read as the original owner.
//
// The lock file is named `<database><LOCK_SUFFIX>`. If a database is stranded
// behind a lock whose owner is genuinely gone and this VFS declines to reclaim
// it, deleting that file by hand is the recovery, and is safe exactly when no
// process is using the database.
//
// One method is deliberately absent: xShmMap. Shared memory exists so that
// several connections can share one WAL index, and this VFS has already ruled
// that out by holding the database exclusively. WAL is still available, but
// only by the route SQLite documents for exactly this situation: set
// locking_mode=EXCLUSIVE before switching journal modes and SQLite keeps the
// WAL index on the heap instead. Ask for WAL without that and SQLite silently
// stays on the rollback journal, which is why the worker reads the effective
// journal mode back and refuses the mismatch.

"use strict";

const nodeFS = require("node:fs");
const nodePath = require("node:path");
const nodeCrypto = require("node:crypto");

// DEFAULT_VFS_NAME is the name this VFS registers under, and the name callers
// pass as `vfs=` in a DSN.
const DEFAULT_VFS_NAME = "nodefs";

// SECTOR_SIZE is what we report to SQLite as the atomic write unit. 4096
// matches the page size of every filesystem we care about.
const SECTOR_SIZE = 4096;

// LOCK_SUFFIX names the sidecar file carrying the exclusive claim on a main
// database. It sits next to the database itself, so an operator who needs to
// clear a lock by hand can find it without knowing this file.
const LOCK_SUFFIX = "-nodefs-lock";

// RECLAIM_STALE_MS bounds how long the reclaim marker is honored. Reclaiming a
// lock is a handful of syscalls, so a marker older than this was left by a
// process that died in the middle of one.
const RECLAIM_STALE_MS = 30_000;

// sleepSignal backs xSleep. Atomics.wait needs a shared integer array to wait
// on; nothing ever notifies this one, so every wait runs to its timeout, which
// is exactly the blocking sleep SQLite is asking for.
const sleepSignal = new Int32Array(new SharedArrayBuffer(4));

// isNodeHost reports whether we are running under Node rather than a browser
// or a browser Worker. Callers use it to decide whether installing this VFS is
// even possible.
function isNodeHost() {
	return (
		typeof globalThis.process === "object" &&
		!!globalThis.process?.versions?.node &&
		typeof globalThis.importScripts !== "function"
	);
}

// pidIsAlive reports whether a process id still exists. Signal 0 performs the
// permission and existence checks without delivering anything.
function pidIsAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) {
		return false;
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM means the process exists but belongs to another user, which
		// still counts as alive.
		return error.code === "EPERM";
	}
}

// processStartTicks reads the kernel's record of when a process started, in
// clock ticks since boot. A pid on its own is not an identity: pids are
// recycled, and a crashed owner whose number has since been reused would read
// as alive forever, stranding the database behind a lock nothing will reclaim.
// The pair (pid, start time) is not reused within a boot, so it is one.
//
// Only Linux exposes this for an arbitrary pid. Elsewhere this returns null and
// the caller falls back to the plain liveness check, which is what this code
// did before.
function processStartTicks(pid) {
	try {
		const stat = nodeFS.readFileSync(`/proc/${pid}/stat`, "utf8");

		// The second field is the executable name in parentheses and may
		// itself contain spaces and parentheses, so the fields after it are
		// counted from the last ')' rather than from the start of the line.
		// That puts field 3 at index 0, and starttime is field 22.
		const after = stat.slice(stat.lastIndexOf(")") + 2);
		const ticks = Number(after.split(" ")[19]);

		return Number.isFinite(ticks) ? ticks : null;
	} catch (_) {
		return null;
	}
}

// ownerIsLive reports whether the process named by a lock file is still
// running. A pid that exists but started at a different time than the lock
// records is a recycled number rather than the original owner, so the lock is
// stale despite the pid being alive.
function ownerIsLive(owner) {
	if (!owner || !pidIsAlive(owner.pid)) {
		return false;
	}

	const ticks = processStartTicks(owner.pid);
	if (ticks === null || owner.startTicks === null ||
		owner.startTicks === undefined) {

		return true;
	}

	return ticks === owner.startTicks;
}

// installNodeFsVfs registers the node:fs VFS with the given sqlite3 namespace
// and returns a small utility handle. It is idempotent: a second call with the
// same name returns the already-registered handle rather than failing, so a
// worker can call it unconditionally on every open.
function installNodeFsVfs(sqlite3, options = {}) {
	if (!isNodeHost()) {
		throw new Error(
			"the nodefs SQLite VFS requires a Node host; use OPFS in " +
				"a browser"
		);
	}

	const vfsName = options.name || DEFAULT_VFS_NAME;
	const capi = sqlite3.capi;
	const wasm = sqlite3.wasm;

	if (capi.sqlite3_vfs_find(vfsName)) {
		return installNodeFsVfs.installed?.get(vfsName);
	}

	// rootDir anchors relative database names. Absolute names are used as
	// given, so a host that already knows its data directory can simply pass
	// full paths.
	const rootDir = nodePath.resolve(options.directory || process.cwd());

	// openFiles maps a sqlite3_file pointer to the state we keep for it. The
	// pointer is the only handle SQLite hands back to the io methods.
	const openFiles = new Map();

	// heldLocks maps a lock file path to the descriptor holding it, so xClose
	// can release exactly what xOpen took.
	const heldLocks = new Map();

	// lastError carries the most recent failure so xGetLastError can report
	// something better than a bare result code.
	let lastError = null;

	function storeErr(error, rc) {
		if (error !== undefined) {
			lastError = error;
		}
		return rc === undefined ? 0 : rc;
	}

	function popErr() {
		const error = lastError;
		lastError = null;
		return error;
	}

	function resolvePath(name) {
		return nodePath.resolve(rootDir, name);
	}

	function fileFor(pFile) {
		const file = openFiles.get(Number(pFile));
		if (!file) {
			throw new Error(`no open node:fs file for handle ${pFile}`);
		}
		return file;
	}

	// syncDir flushes a directory entry, so that a file's creation or removal
	// is itself durable rather than merely visible. Without it a power loss can
	// undo the unlink of a rollback journal that SQLite treated as the commit
	// point, resurrecting the journal and rolling a committed transaction back.
	//
	// Failure is deliberately swallowed. Not every platform lets a directory be
	// opened for reading, and turning a weaker barrier into a failed delete
	// would be the worse trade.
	function syncDir(dirPath) {
		let dfd;
		try {
			dfd = nodeFS.openSync(dirPath, "r");
		} catch (_) {
			return;
		}

		try {
			nodeFS.fsyncSync(dfd);
		} catch (_) {
		} finally {
			nodeFS.closeSync(dfd);
		}
	}

	// ioErrForWrite distinguishes a full disk from a broken one. SQLite's own
	// unix VFS returns SQLITE_FULL for ENOSPC, and the difference is what sends
	// an operator to `df` rather than to smartctl.
	function ioErrForWrite(error, fallback) {
		return error && error.code === "ENOSPC" ? capi.SQLITE_FULL : fallback;
	}

	// heapView returns a view of the wasm heap for a pointer/length pair. The
	// view is only valid for the duration of one synchronous call, since any
	// wasm memory growth detaches it.
	function heapView(ptr, n) {
		const start = Number(ptr);
		return wasm.heap8u().subarray(start, start + n);
	}

	// readLockOwner returns the parsed contents of a lock file, or null when it
	// is missing or unreadable. An unparseable lock file is treated as stale,
	// since the only way to produce one is to crash midway through writing it.
	function readLockOwner(lockPath) {
		try {
			return JSON.parse(nodeFS.readFileSync(lockPath, "utf8"));
		} catch (_) {
			return null;
		}
	}

	// lockedError builds the error for a database another process holds. The
	// holder travels on the error object as well as in the message, because
	// the worker turns it into something the caller can act on rather than the
	// bare SQLITE_CANTOPEN that SQLite would otherwise surface.
	function lockedError(dbPath, lockPath, owner) {
		const pid = owner && owner.pid ? owner.pid : "unknown";
		const error = new Error(
			`database is locked by another process (pid ${pid}): ${dbPath}`
		);
		error.nodefsLockHolderPid = owner ? owner.pid : null;
		error.nodefsLockPath = lockPath;

		return error;
	}

	// writeLockFile creates the lock file and stamps it with this process's
	// identity. It reports false when the lock already exists, and throws for
	// every other failure.
	function writeLockFile(lockPath) {
		let fd;
		try {
			fd = nodeFS.openSync(lockPath, "wx", 0o600);
		} catch (error) {
			if (error.code === "EEXIST") {
				return false;
			}
			throw error;
		}

		try {
			nodeFS.writeSync(
				fd,
				JSON.stringify({
					pid: process.pid,
					startTicks: processStartTicks(process.pid),
					at: Date.now(),
				})
			);
		} finally {
			nodeFS.closeSync(fd);
		}

		return true;
	}

	// withReclaimMutex runs body as the only process reclaiming this lock, and
	// reports whether it ran at all.
	//
	// Reclaiming means observing a dead owner and then replacing the file, and
	// those two steps cannot be made one with anything Node exposes. Left
	// unserialized they interleave, and the interleavings all end the same
	// way: while one process has the stale lock momentarily out of the way, a
	// second finds the path empty, creates its own, and two writers now hold
	// one database. Inspecting the file first does not help, because the
	// inspection is itself a window.
	//
	// mkdir is the one exclusion primitive available here that costs nothing:
	// it fails if the directory exists. So a marker directory beside the lock
	// serializes reclamation, and only its holder may touch the lock file.
	function withReclaimMutex(lockPath, body) {
		const mutexPath = `${lockPath}.reclaim`;

		try {
			nodeFS.mkdirSync(mutexPath);
		} catch (error) {
			if (error.code !== "EEXIST") {
				throw error;
			}

			// The marker is held across a handful of syscalls, so one older
			// than any reclaim could take belongs to a process that died
			// inside one. Clearing it costs a retry at worst, where leaving it
			// would strand the database for good.
			let age = RECLAIM_STALE_MS;
			try {
				age = Date.now() - nodeFS.statSync(mutexPath).mtimeMs;
			} catch (_) {
				return false;
			}

			if (age < RECLAIM_STALE_MS) {
				return false;
			}

			try {
				nodeFS.rmdirSync(mutexPath);
			} catch (_) {}

			return false;
		}

		try {
			return body();
		} finally {
			try {
				nodeFS.rmdirSync(mutexPath);
			} catch (_) {}
		}
	}

	// reclaimStaleLock replaces a lock whose owner is gone with one naming this
	// process, and reports whether it now holds the lock. The replacement
	// happens under the reclaim mutex so that no other process can slip into
	// the moment when the lock file does not exist.
	function reclaimStaleLock(lockPath) {
		return withReclaimMutex(lockPath, () => {
			// Read it again in here. A reclaimer ahead of us may have
			// finished between our staleness check and our getting the
			// mutex, in which case the lock is now held by a live process.
			const owner = readLockOwner(lockPath);
			if (ownerIsLive(owner)) {
				return false;
			}

			try {
				nodeFS.unlinkSync(lockPath);
			} catch (error) {
				if (error.code !== "ENOENT") {
					throw error;
				}
			}

			return writeLockFile(lockPath);
		});
	}

	// acquireLock takes the exclusive open lock for a main database file. It
	// reclaims a lock whose owning process is gone, and otherwise throws so
	// the open fails loudly rather than racing another writer.
	function acquireLock(dbPath) {
		const lockPath = `${dbPath}${LOCK_SUFFIX}`;

		// Two passes are all this needs: one to find the lock taken and clear
		// a dead owner out of the way, and one to take it. A process that
		// loses the reclaim race does not get a third try, because the winner
		// now holds a live lock and the answer is no.
		for (let attempt = 0; attempt < 2; attempt++) {
			if (writeLockFile(lockPath)) {
				heldLocks.set(dbPath, lockPath);
				return;
			}

			const owner = readLockOwner(lockPath);
			if (ownerIsLive(owner)) {
				throw lockedError(dbPath, lockPath, owner);
			}

			if (reclaimStaleLock(lockPath)) {
				heldLocks.set(dbPath, lockPath);
				return;
			}
		}

		throw lockedError(dbPath, lockPath, readLockOwner(lockPath));
	}

	// releaseLock drops the claim taken by acquireLock. It checks that the
	// lock still names this process before removing it: if a reclaimer
	// elsewhere concluded we were dead and took the lock for itself, the file
	// on disk is now that process's claim, and deleting it would hand the
	// database to a third.
	function releaseLock(dbPath) {
		const lockPath = heldLocks.get(dbPath);
		if (!lockPath) {
			return;
		}
		heldLocks.delete(dbPath);

		const owner = readLockOwner(lockPath);
		if (owner && owner.pid !== process.pid) {
			return;
		}

		try {
			nodeFS.unlinkSync(lockPath);
		} catch (error) {
			if (error.code !== "ENOENT") {
				storeErr(error);
			}
		}
	}

	const ioMethods = {
		xCheckReservedLock: function (pFile, pOut) {
			// A writer here holds the database exclusively for its lifetime,
			// so no other connection can be holding a reserved lock. The
			// answer is the same, though for a weaker reason, for the one case
			// that escapes the open lock: a read-only opener takes no lock and
			// has no reserved lock of its own to report.
			storeErr();
			wasm.poke32(pOut, 0);
			return 0;
		},

		xClose: function (pFile) {
			storeErr();
			const key = Number(pFile);
			const file = openFiles.get(key);
			if (!file) {
				return 0;
			}
			openFiles.delete(key);
			try {
				nodeFS.closeSync(file.fd);
				if (file.locked) {
					releaseLock(file.path);
				}
				if (file.flags & capi.SQLITE_OPEN_DELETEONCLOSE) {
					try {
						nodeFS.unlinkSync(file.path);
					} catch (error) {
						if (error.code !== "ENOENT") {
							throw error;
						}
					}
				}
				return 0;
			} catch (error) {
				return storeErr(error, capi.SQLITE_IOERR);
			}
		},

		xDeviceCharacteristics: function (pFile) {
			// Claim nothing. A wallet database is worth more than the write
			// batching SQLite would enable on the strength of these hints.
			return 0;
		},

		xFileControl: function (pFile, opId, pArg) {
			return capi.SQLITE_NOTFOUND;
		},

		xFileSize: function (pFile, pSz64) {
			storeErr();
			try {
				const file = fileFor(pFile);
				const size = nodeFS.fstatSync(file.fd).size;
				wasm.poke64(pSz64, BigInt(size));
				return 0;
			} catch (error) {
				return storeErr(error, capi.SQLITE_IOERR);
			}
		},

		xLock: function (pFile, lockType) {
			storeErr();
			try {
				fileFor(pFile).lockType = lockType;
				return 0;
			} catch (error) {
				return storeErr(error, capi.SQLITE_IOERR);
			}
		},

		xRead: function (pFile, pDest, n, offset64) {
			storeErr();
			try {
				const file = fileFor(pFile);
				const view = heapView(pDest, n);
				const nRead = nodeFS.readSync(
					file.fd,
					view,
					0,
					n,
					Number(offset64)
				);
				if (nRead < n) {
					// SQLite requires the tail of a short read to be zeroed.
					view.fill(0, nRead, n);
					return capi.SQLITE_IOERR_SHORT_READ;
				}
				return 0;
			} catch (error) {
				return storeErr(error, capi.SQLITE_IOERR_READ);
			}
		},

		xSectorSize: function (pFile) {
			return SECTOR_SIZE;
		},

		xSync: function (pFile, flags) {
			storeErr();
			try {
				const file = fileFor(pFile);
				// A durability barrier is the whole point of xSync, so this
				// deliberately does not degrade to fdatasync on the DATAONLY
				// hint: file size changes must reach the disk too.
				nodeFS.fsyncSync(file.fd);

				// The unix VFS syncs the parent directory at the first sync of
				// a file it created, so the file's existence is durable before
				// the database starts depending on it. SQLite cannot ask for
				// that through the VFS interface, so it is done here.
				if (file.needsDirSync) {
					syncDir(nodePath.dirname(file.path));
					file.needsDirSync = false;
				}

				return 0;
			} catch (error) {
				return storeErr(error, capi.SQLITE_IOERR_FSYNC);
			}
		},

		xTruncate: function (pFile, sz64) {
			storeErr();
			try {
				nodeFS.ftruncateSync(fileFor(pFile).fd, Number(sz64));
				return 0;
			} catch (error) {
				return storeErr(
					error,
					ioErrForWrite(error, capi.SQLITE_IOERR_TRUNCATE)
				);
			}
		},

		xUnlock: function (pFile, lockType) {
			storeErr();
			try {
				fileFor(pFile).lockType = lockType;
				return 0;
			} catch (error) {
				return storeErr(error, capi.SQLITE_IOERR);
			}
		},

		xWrite: function (pFile, pSrc, n, offset64) {
			storeErr();
			try {
				const file = fileFor(pFile);
				const nWrote = nodeFS.writeSync(
					file.fd,
					heapView(pSrc, n),
					0,
					n,
					Number(offset64)
				);
				if (nWrote !== n) {
					throw new Error(
						`short write: wrote ${nWrote} of ${n} bytes`
					);
				}
				return 0;
			} catch (error) {
				return storeErr(
					error,
					ioErrForWrite(error, capi.SQLITE_IOERR_WRITE)
				);
			}
		},
	};

	const nodeIoMethods = new capi.sqlite3_io_methods();
	nodeIoMethods.$iVersion = 1;
	sqlite3.vfs.installVfs({
		io: { struct: nodeIoMethods, methods: ioMethods },
	});

	const vfsMethods = {
		xAccess: function (pVfs, zName, flags, pOut) {
			storeErr();
			try {
				const target = resolvePath(wasm.cstrToJs(zName));
				let mode = nodeFS.constants.F_OK;
				if (flags === capi.SQLITE_ACCESS_READWRITE) {
					mode = nodeFS.constants.R_OK | nodeFS.constants.W_OK;
				} else if (flags === capi.SQLITE_ACCESS_READ) {
					mode = nodeFS.constants.R_OK;
				}
				nodeFS.accessSync(target, mode);
				wasm.poke32(pOut, 1);
			} catch (_) {
				wasm.poke32(pOut, 0);
			}
			return 0;
		},

		xCurrentTime: function (pVfs, pOut) {
			wasm.poke(
				pOut,
				2440587.5 + new Date().getTime() / 86400000,
				"double"
			);
			return 0;
		},

		xCurrentTimeInt64: function (pVfs, pOut) {
			wasm.poke(pOut, 2440587.5 * 86400000 + new Date().getTime(), "i64");
			return 0;
		},

		xDelete: function (pVfs, zName, doSyncDir) {
			storeErr();
			const target = resolvePath(wasm.cstrToJs(zName));
			try {
				nodeFS.unlinkSync(target);
			} catch (error) {
				if (error.code !== "ENOENT") {
					storeErr(error);
					return capi.SQLITE_IOERR_DELETE;
				}
			}

			// SQLite sets this under synchronous=EXTRA, where in rollback
			// journal mode the unlink above *is* the commit. Ignoring the flag
			// would quietly give EXTRA no more than FULL, which is the same
			// class of silent substitution the journal-mode readback exists to
			// refuse.
			if (doSyncDir) {
				syncDir(nodePath.dirname(target));
			}

			return 0;
		},

		xFullPathname: function (pVfs, zName, nOut, pOut) {
			// SQLite builds the journal and WAL names by appending suffixes to
			// whatever this returns, so it must be the real absolute path.
			// Otherwise a journal would land somewhere the database is not.
			const full = resolvePath(wasm.cstrToJs(zName));
			const scope = wasm.scopedAllocPush();
			try {
				const cFull = wasm.scopedAllocCString(full);
				const written = wasm.cstrncpy(pOut, cFull, nOut);
				return written < nOut ? 0 : capi.SQLITE_CANTOPEN;
			} catch (error) {
				storeErr(error);
				return capi.SQLITE_CANTOPEN;
			} finally {
				wasm.scopedAllocPop(scope);
			}
		},

		xGetLastError: function (pVfs, nOut, pOut) {
			const error = popErr();
			if (error) {
				const scope = wasm.scopedAllocPush();
				try {
					const [cMsg, n] = wasm.scopedAllocCString(
						error.message,
						true
					);
					wasm.cstrncpy(pOut, cMsg, nOut);
					if (n > nOut) {
						wasm.poke8(wasm.ptr.add(pOut, nOut, -1), 0);
					}
				} catch (_) {
					return capi.SQLITE_NOMEM;
				} finally {
					wasm.scopedAllocPop(scope);
				}
			}
			return error ? error.sqlite3Rc || capi.SQLITE_IOERR : 0;
		},

		xOpen: function (pVfs, zName, pFile, flags, pOutFlags) {
			storeErr();
			let fd = -1;
			let target = "";
			let took = false;
			let created = false;
			try {
				const isMainDB = !!(flags & capi.SQLITE_OPEN_MAIN_DB);
				const create = !!(flags & capi.SQLITE_OPEN_CREATE);
				const readOnly = !!(flags & capi.SQLITE_OPEN_READONLY);

				// A null name asks for an anonymous temp file. SQLite deletes
				// it on close, so a random name in the root directory is
				// enough.
				target =
					zName && wasm.peek8(zName)
						? resolvePath(wasm.cstrToJs(zName))
						: nodePath.join(
								rootDir,
								`etilqs_${nodeCrypto
									.randomBytes(12)
									.toString("hex")}`
						  );

				if (create) {
					// The host may not have created the data directory yet.
					// Creating it here keeps a first run from failing on a
					// missing parent rather than on anything meaningful.
					nodeFS.mkdirSync(nodePath.dirname(target), {
						recursive: true,
					});
				}

				// The claim comes before the file does. Creating first leaves a
				// window in which a second process racing the same first-time
				// open truncates a database this one has already begun
				// writing, and the loser of the lock race discovers it only
				// afterwards, with the damage done.
				if (isMainDB && !readOnly) {
					acquireLock(target);
					took = true;
				}

				let openMode;
				if (readOnly) {
					openMode = "r";
				} else {
					if (create) {
						// "a+" would force every write to the end of the
						// file, so create the file separately when it is
						// missing and then open it read/write. The create is
						// "wx" rather than "w" because an existing database
						// must never be truncated on the way in; EEXIST here
						// simply means someone got there first.
						try {
							nodeFS.closeSync(
								nodeFS.openSync(target, "wx", 0o600)
							);
							created = true;
						} catch (error) {
							if (error.code !== "EEXIST") {
								throw error;
							}
						}
					}
					openMode = "r+";
				}

				fd = nodeFS.openSync(target, openMode);

				openFiles.set(Number(pFile), {
					fd,
					path: target,
					flags,
					locked: took,
					lockType: capi.SQLITE_LOCK_NONE,

					// A file this VFS created is not durably present until its
					// parent directory is synced. The unix VFS does that at the
					// first xSync of such a file, and SQLite does not signal it
					// through the VFS interface, so it is tracked here.
					needsDirSync: created,
				});

				const sq3File = new capi.sqlite3_file(pFile);
				sq3File.$pMethods = nodeIoMethods.pointer;
				sq3File.dispose();
				if (pOutFlags) {
					wasm.poke32(pOutFlags, flags);
				}
				return 0;
			} catch (error) {
				// SQLite leaves pMethods null for a failed xOpen and so never
				// calls xClose for it, which means anything recorded here
				// would outlive the descriptor it describes. A later
				// allocation landing on the same pointer would then find a
				// stale entry naming a closed fd.
				openFiles.delete(Number(pFile));

				if (fd >= 0) {
					try {
						nodeFS.closeSync(fd);
					} catch (_) {}
				}
				if (took) {
					releaseLock(target);
				}
				storeErr(error);
				return capi.SQLITE_CANTOPEN;
			}
		},

		xRandomness: function (pVfs, nOut, pOut) {
			const bytes = nodeCrypto.randomBytes(nOut);
			heapView(pOut, nOut).set(bytes);
			return nOut;
		},

		xSleep: function (pVfs, microseconds) {
			// SQLite calls this from inside a busy handler, so returning
			// without sleeping would turn a busy timeout into a tight spin
			// that burns a core for however long the timeout is. Atomics.wait
			// blocks this thread for real, and it is safe precisely because
			// this VFS only ever runs inside the dedicated SQLite worker,
			// never on a thread anyone else's event loop depends on.
			const ms = Math.max(1, Math.round(Number(microseconds) / 1000));
			Atomics.wait(sleepSignal, 0, 0, ms);
			return 0;
		},
	};

	const nodeVfs = new capi.sqlite3_vfs();
	nodeVfs.$iVersion = 2;
	nodeVfs.$szOsFile = capi.sqlite3_file.structInfo.sizeof;
	nodeVfs.$mxPathname = 1024;
	nodeVfs.addOnDispose((nodeVfs.$zName = wasm.allocCString(vfsName)));
	sqlite3.vfs.installVfs({
		vfs: { struct: nodeVfs, methods: vfsMethods },
	});

	const util = {
		vfsName,
		rootDir,
		getVfs: () => nodeVfs,
		openFileCount: () => openFiles.size,

		// lockHolder names the process currently holding the open lock for a
		// database, or null when nothing does.
		//
		// SQLite's core does not carry xGetLastError's message out to the
		// caller, so a collision reaches the application as a bare
		// SQLITE_CANTOPEN, indistinguishable from a missing directory or a
		// permissions problem. This lets the worker say which process is
		// holding the database instead.
		lockHolder: (dbPath) => {
			const owner = readLockOwner(
				`${resolvePath(dbPath)}${LOCK_SUFFIX}`
			);

			return owner && ownerIsLive(owner) ? owner : null;
		},
	};

	if (!installNodeFsVfs.installed) {
		installNodeFsVfs.installed = new Map();
	}
	installNodeFsVfs.installed.set(vfsName, util);

	return util;
}

module.exports = {
	DEFAULT_VFS_NAME,
	installNodeFsVfs,
	isNodeHost,
};
