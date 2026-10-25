/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestWalletReset, runPendingWalletReset, RUNTIME_LOCK_NAME } from './wallet-reset';

const ROOT_ENTRIES = ['waved-1.db', 'rayito-wallet-v1', '.opfs-sahpool'];
const WIPE_MARKER_KEY = 'rayito.walletWipe';

let entries: string[];
let insideLock = false;
const removedOutsideLock: string[] = [];
const removeEntry = vi.fn(async (name: string) => {
  if (!insideLock) removedOutsideLock.push(name);
  entries = entries.filter((entry) => entry !== name);
});
const lockRequest = vi.fn(
  async (_name: string, _options: LockOptions, callback: () => Promise<unknown>) => {
    insideLock = true;
    try {
      return await callback();
    } finally {
      insideLock = false;
    }
  },
);

function stubNavigator(locks: unknown): void {
  vi.stubGlobal('navigator', {
    locks,
    storage: {
      getDirectory: async () => ({
        async *keys() {
          yield* [...entries];
        },
        removeEntry,
      }),
    },
  });
}

function busy(): DOMException {
  return new DOMException('handle open', 'NoModificationAllowedError');
}

// Removal retries back off on real timers, so let them run.
async function run(): ReturnType<typeof runPendingWalletReset> {
  const outcome = runPendingWalletReset();
  await vi.runAllTimersAsync();
  return outcome;
}

describe('wallet reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    entries = [...ROOT_ENTRIES];
    removedOutsideLock.length = 0;
    removeEntry.mockClear();
    lockRequest.mockClear();
    stubNavigator({ request: lockRequest });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('leaves storage alone when no deletion was requested', async () => {
    await expect(run()).resolves.toBe('none');
    expect(lockRequest).not.toHaveBeenCalled();
    expect(entries).toEqual(ROOT_ENTRIES);
  });

  it('deletes every root entry only while holding the SDK runtime lock', async () => {
    requestWalletReset();

    await expect(run()).resolves.toBe('done');
    expect(lockRequest).toHaveBeenCalledWith(
      RUNTIME_LOCK_NAME,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      expect.any(Function),
    );
    expect(entries).toEqual([]);
    expect(removedOutsideLock).toEqual([]);
    expect(localStorage.getItem(WIPE_MARKER_KEY)).toBeNull();
  });

  it('consumes the confirmation, so the next load deletes nothing', async () => {
    requestWalletReset();
    await run();
    entries = [...ROOT_ENTRIES];

    await expect(run()).resolves.toBe('none');
    expect(entries).toEqual(ROOT_ENTRIES);
  });

  it('ignores a confirmation replayed after it expired', async () => {
    requestWalletReset();
    vi.setSystemTime(Date.now() + 3 * 60 * 1_000);

    await expect(run()).resolves.toBe('none');
    expect(entries).toEqual(ROOT_ENTRIES);
  });

  it('deletes nothing and drops the confirmation when another tab holds the runtime', async () => {
    lockRequest.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    requestWalletReset();

    await expect(run()).resolves.toBe('blocked');
    expect(removeEntry).not.toHaveBeenCalled();
    await expect(run()).resolves.toBe('none');
  });

  it('retries files a stopping runtime still holds', async () => {
    removeEntry.mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy());
    requestWalletReset();

    await expect(run()).resolves.toBe('done');
    expect(entries).toEqual([]);
  });

  it('reports an untouched wallet when the first removal never succeeds', async () => {
    removeEntry.mockRejectedValue(busy());
    requestWalletReset();

    await expect(run()).resolves.toBe('untouched');
    expect(entries).toEqual(ROOT_ENTRIES);
    expect(localStorage.getItem(WIPE_MARKER_KEY)).toBeNull();
  });

  it('marks a partial wipe and finishes it on the next load from any tab', async () => {
    removeEntry.mockImplementation(async (name: string) => {
      if (name === '.opfs-sahpool') throw busy();
      entries = entries.filter((entry) => entry !== name);
    });
    requestWalletReset();

    await expect(run()).resolves.toBe('partial');
    expect(entries).toEqual(['.opfs-sahpool']);
    expect(localStorage.getItem(WIPE_MARKER_KEY)).not.toBeNull();

    // A new tab has no confirmation of its own, only the shared marker.
    sessionStorage.clear();
    removeEntry.mockImplementation(async (name: string) => {
      entries = entries.filter((entry) => entry !== name);
    });

    await expect(run()).resolves.toBe('done');
    expect(entries).toEqual([]);
    expect(localStorage.getItem(WIPE_MARKER_KEY)).toBeNull();
  });

  it('refuses to delete on a browser without Web Locks', async () => {
    stubNavigator(undefined);
    requestWalletReset();

    await expect(run()).resolves.toBe('untouched');
    expect(removeEntry).not.toHaveBeenCalled();
  });
});
