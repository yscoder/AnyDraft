/**
 * IndexedDB 图片存储：文件名 → data URI。
 * 容量远大于 localStorage，适合多图长期保存；本地图片注册表存这里。
 */

const DB_NAME = 'anydraft';
/** 更名前使用的库名，仅用于一次性搬运旧图片 */
const LEGACY_DB_NAME = 'wechat-mp-editor';
const STORE = 'images';

export interface StoredImage {
  name: string;
  dataUrl: string;
  /** dataUrl 字节数，供统计用 */
  size: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('打开图片库失败'));
  });
}

/** 打开已存在的库；不存在或失败都返回 null，不新建 */
function openIfExists(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(name);
    } catch {
      resolve(null);
      return;
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function readAll<T>(db: IDBDatabase): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** 一次性把更名前那版图片库搬过来；失败不影响新库使用 */
async function migrateLegacyImages(db: IDBDatabase): Promise<void> {
  const legacy = await openIfExists(LEGACY_DB_NAME);
  if (!legacy) return;
  try {
    if (!legacy.objectStoreNames.contains(STORE)) return;
    const items = await readAll<StoredImage>(legacy);
    if (!items.length) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      for (const item of items) tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 迁移失败保留原样，不阻塞后续读写
  } finally {
    legacy.close();
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb().then(async (db) => {
      await migrateLegacyImages(db);
      return db;
    });
  }
  return dbPromise;
}

/** 读出全部图片 → { 文件名: dataUrl } */
export async function getAllImages(): Promise<Record<string, string>> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const map: Record<string, string> = {};
      for (const item of req.result as StoredImage[]) map[item.name] = item.dataUrl;
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
}

/** 保存一张图片（同名覆盖） */
export async function putImage(name: string, dataUrl: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ name, dataUrl, size: dataUrl.length } satisfies StoredImage);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 删除一张图片 */
export async function deleteImage(name: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 统计图片库占用 */
export async function imageUsage(): Promise<{ count: number; bytes: number }> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = req.result as StoredImage[];
      resolve({ count: items.length, bytes: items.reduce((s, i) => s + i.size, 0) });
    };
    req.onerror = () => reject(req.error);
  });
}
