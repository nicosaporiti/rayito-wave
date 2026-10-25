// The SDK holds this Web Lock for as long as a tab runs the wallet runtime
// (RUNTIME_LOCK_NAME in @lightninglabs/wavelength-web/dist/runtime-lock.js,
// which the package does not export). Holding it keeps every other tab from
// starting the runtime while we wipe. It does not prove that a runtime which
// just stopped has closed its SQLite file handles, so removals are retried.
export const RUNTIME_LOCK_NAME = 'wavelength-web-runtime';

// The user's confirmation, scoped to this tab. It is consumed by the next page
// load whatever the outcome and expires quickly, so a restored or duplicated
// tab cannot replay an old confirmation days later.
const REQUEST_KEY = 'rayito.walletReset';
const REQUEST_TTL_MS = 2 * 60 * 1_000;
// Written before the first file is removed and cleared once the wipe finishes.
// It is shared by every tab, so a wipe interrupted halfway is completed by the
// next page load anywhere instead of leaving a half-deleted wallet to start.
const WIPE_MARKER_KEY = 'rayito.walletWipe';
// A reload can start this page before the previous one has released the lock.
const LOCK_WAIT_MS = 3_000;
const REMOVE_ATTEMPTS = 8;
const REMOVE_RETRY_MS = 250;

/**
 * - `blocked`: another tab kept the wallet open; nothing was deleted.
 * - `untouched`: the browser refused the deletion; nothing was deleted.
 * - `partial`: some files are gone; the next page load finishes the wipe.
 */
export type WalletResetOutcome = 'none' | 'done' | 'blocked' | 'untouched' | 'partial';

/** Records the user's confirmation; the next page load deletes the wallet. */
export function requestWalletReset(): void {
  sessionStorage.setItem(REQUEST_KEY, String(Date.now()));
}

function consumeRequest(): boolean {
  try {
    const requestedAt = Number(sessionStorage.getItem(REQUEST_KEY));
    sessionStorage.removeItem(REQUEST_KEY);
    return requestedAt > 0 && Date.now() - requestedAt < REQUEST_TTL_MS;
  } catch {
    return false;
  }
}

function wipeInProgress(): boolean {
  try {
    return localStorage.getItem(WIPE_MARKER_KEY) !== null;
  } catch {
    return false;
  }
}

function setWipeMarker(active: boolean): void {
  try {
    if (active) localStorage.setItem(WIPE_MARKER_KEY, String(Date.now()));
    else localStorage.removeItem(WIPE_MARKER_KEY);
  } catch {
    // Without localStorage an interrupted wipe is only reported, not resumed.
  }
}

/**
 * Deletes every wallet file in this origin's private file system when the
 * user just confirmed it, or when an earlier wipe was interrupted. It must run
 * before the wallet engine is created, so this tab opens no database. The
 * runtime cache in Cache Storage and the language preference are kept.
 */
export async function runPendingWalletReset(): Promise<WalletResetOutcome> {
  const requested = consumeRequest();
  const resuming = wipeInProgress();
  if (!requested && !resuming) return 'none';
  // Deleting without the lock could pull files out from under another tab.
  if (!navigator.locks) return resuming ? 'partial' : 'untouched';

  const signal = timeoutSignal(LOCK_WAIT_MS);
  try {
    return await navigator.locks.request(RUNTIME_LOCK_NAME, { signal }, () => wipe(resuming));
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return resuming ? 'partial' : 'blocked';
    }
    return resuming ? 'partial' : 'untouched';
  }
}

// AbortSignal.timeout is missing from Chromium 100-102, which the SDK supports.
function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(new DOMException('Lock wait timed out', 'TimeoutError')), ms);
  return controller.signal;
}

async function wipe(resuming: boolean): Promise<WalletResetOutcome> {
  let removed = 0;
  try {
    // The daemon spreads its databases across several SQLite VFSs (hashed
    // files at the root, the configured data directory and .opfs-sahpool),
    // and Rayito is the only app on its origin, so the whole root goes.
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const name of root.keys()) names.push(name);

    setWipeMarker(true);
    for (const name of names) {
      await removeWithRetry(root, name);
      removed += 1;
    }
  } catch {
    if (removed === 0 && !resuming) {
      setWipeMarker(false);
      return 'untouched';
    }
    return 'partial';
  }

  setWipeMarker(false);
  return 'done';
}

async function removeWithRetry(root: FileSystemDirectoryHandle, name: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await root.removeEntry(name, { recursive: true });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return;
      if (attempt >= REMOVE_ATTEMPTS) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, REMOVE_RETRY_MS * attempt));
    }
  }
}
