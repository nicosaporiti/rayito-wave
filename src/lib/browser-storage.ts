interface IterableDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

async function clearOriginPrivateFileSystem(): Promise<void> {
  if (!navigator.storage.getDirectory) return;

  const directory = await navigator.storage.getDirectory();
  for await (const [name] of (directory as IterableDirectoryHandle).entries()) {
    await directory.removeEntry(name, { recursive: true });
  }
}

async function clearIndexedDatabases(): Promise<void> {
  if (!indexedDB.databases) return;

  const databases = await indexedDB.databases();
  await Promise.all(
    databases.flatMap(({ name }) => {
      if (!name) return [];

      return [
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error(`No se pudo borrar ${name}: la base sigue abierta.`));
        }),
      ];
    }),
  );
}

async function clearCacheStorage(): Promise<void> {
  if (!('caches' in window)) return;

  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
}

export async function clearBrowserWalletData(): Promise<void> {
  localStorage.clear();
  sessionStorage.clear();

  await Promise.all([
    clearOriginPrivateFileSystem(),
    clearIndexedDatabases(),
    clearCacheStorage(),
  ]);
}
