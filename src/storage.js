// Armazenamento local (IndexedDB) — tudo fica no aparelho da pessoa.
// Se o IndexedDB não estiver disponível (aba anônima, preview), cai para memória.
const Store = (() => {
  const DB_NAME = "provador";
  const STORE = "kv";
  let dbPromise = null;
  const memory = new Map();
  let usingMemory = false;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { usingMemory = true; resolve(null); };
        req.onblocked = () => { usingMemory = true; resolve(null); };
      } catch (e) {
        usingMemory = true;
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function get(key, fallback) {
    const db = await open();
    if (!db) return memory.has(key) ? memory.get(key) : fallback;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result === undefined ? fallback : req.result);
        req.onerror = () => resolve(fallback);
      } catch (e) {
        resolve(memory.has(key) ? memory.get(key) : fallback);
      }
    });
  }

  async function set(key, value) {
    memory.set(key, value);
    const db = await open();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  async function clear() {
    memory.clear();
    const db = await open();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  return { get, set, clear, isMemoryOnly: () => usingMemory };
})();
