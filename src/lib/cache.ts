/**
 * Persistent Cache utility using IndexedDB
 * Stores page renders, thumbnails, and extraction results.
 */

const DB_NAME = "PustakaKuCache";
const DB_VERSION = 1;
const STORES = {
  PAGE_RENDERS: "page_renders",
  THUMBNAILS: "thumbnails",
  EXTRACTIONS: "extractions"
};

export interface CacheKey {
  path: string;
  pageNum: number;
}

class CacheDB {
  private db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORES.PAGE_RENDERS)) {
          db.createObjectStore(STORES.PAGE_RENDERS);
        }
        if (!db.objectStoreNames.contains(STORES.THUMBNAILS)) {
          db.createObjectStore(STORES.THUMBNAILS);
        }
        if (!db.objectStoreNames.contains(STORES.EXTRACTIONS)) {
          db.createObjectStore(STORES.EXTRACTIONS);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);
    });
  }

  private makeKey(key: CacheKey): string {
    return `${key.path}::${key.pageNum}`;
  }

  async set(storeName: string, key: CacheKey, value: string | Blob): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(value, this.makeKey(key));

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName: string, key: CacheKey): Promise<string | Blob | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(this.makeKey(key));

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, key: CacheKey): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(this.makeKey(key));

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllForFile(storeName: string, path: string): Promise<Record<number, string | Blob>> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const range = IDBKeyRange.bound(`${path}::0`, `${path}::999999`);
      const request = store.openCursor(range);
      const results: Record<number, string | Blob> = {};

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const keyStr = cursor.key as string;
          const pageNum = parseInt(keyStr.split("::")[1]);
          results[pageNum] = cursor.value;
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.getDB();
    const stores = [STORES.PAGE_RENDERS, STORES.THUMBNAILS, STORES.EXTRACTIONS];
    const transaction = db.transaction(stores, "readwrite");
    stores.forEach(s => transaction.objectStore(s).clear());
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve();
    });
  }

  async calculateSize(): Promise<number> {
    const db = await this.getDB();
    const stores = [STORES.PAGE_RENDERS, STORES.THUMBNAILS, STORES.EXTRACTIONS];
    let totalSize = 0;

    for (const storeName of stores) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const val = cursor.value;
            if (val instanceof Blob) {
              totalSize += val.size;
            } else if (typeof val === 'string') {
              totalSize += val.length;
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    }

    return totalSize;
  }
}

export const cacheDB = new CacheDB();
export { STORES };
