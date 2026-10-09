function openRecordings(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("beyond-hello-recordings", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalRecording(sessionId: string, messageId: string, blob: Blob): Promise<void> {
  const database = await openRecordings();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("recordings", "readwrite");
      transaction.objectStore("recordings").put(blob, `${sessionId}:${messageId}`);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export async function readLocalRecording(sessionId: string, messageId: string): Promise<Blob | null> {
  const database = await openRecordings();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction("recordings").objectStore("recordings").get(`${sessionId}:${messageId}`);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}
