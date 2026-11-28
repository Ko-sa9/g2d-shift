// Persistent browser storage for monthly admin Undo/Redo history.
// Primary: IndexedDB (large capacity, async, non-blocking).
// Fallback: localStorage (for environments where IndexedDB is unavailable).

const DB_NAME = 'work_schedule_undo_history_v1';
const DB_VERSION = 1;
const STORE_NAME = 'histories';
const LS_PREFIX = 'ws_undo_hist_v1::';
const MAX_SAVED_BUCKETS = 24;
const MAX_HISTORY_ENTRIES = 50;

export const buildUndoHistoryKey = ({ appId = 'default', year, month, adminScope = 'all' }) =>
  `${String(appId)}__${Number(year)}_${Number(month)}__${String(adminScope || 'all')}`;

const sanitizeHistory = (raw) => {
  if (!raw || typeof raw !== 'object') return { past: [], future: [] };
  const past = Array.isArray(raw.past) ? raw.past.slice(-MAX_HISTORY_ENTRIES) : [];
  const future = Array.isArray(raw.future) ? raw.future.slice(0, MAX_HISTORY_ENTRIES) : [];
  return { past, future };
};

let dbPromise = null;

const openHistoryDb = () => {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
};

const pruneOldIdbBuckets = async (db) => {
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const allRecords = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    if (allRecords.length <= MAX_SAVED_BUCKETS) return;
    allRecords.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    const toDelete = allRecords.slice(0, allRecords.length - MAX_SAVED_BUCKETS);
    toDelete.forEach((rec) => store.delete(rec.key));
  } catch {
    // Best-effort pruning; ignore errors
  }
};

// localStorage fallback helpers
const loadFromLocalStorage = (key) => {
  try {
    if (typeof localStorage === 'undefined') return { past: [], future: [] };
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return { past: [], future: [] };
    const parsed = JSON.parse(raw);
    return sanitizeHistory(parsed?.history || parsed);
  } catch {
    return { past: [], future: [] };
  }
};

const saveToLocalStorage = (key, history) => {
  try {
    if (typeof localStorage === 'undefined') return;
    const clean = sanitizeHistory(history);
    if (clean.past.length === 0 && clean.future.length === 0) {
      localStorage.removeItem(LS_PREFIX + key);
      return;
    }
    const payload = JSON.stringify({ updatedAt: Date.now(), history: clean });
    try {
      localStorage.setItem(LS_PREFIX + key, payload);
    } catch {
      // Quota exceeded: trim to most recent 15 entries and retry once
      const trimmed = {
        past: clean.past.slice(-15),
        future: clean.future.slice(0, 15),
      };
      try {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify({ updatedAt: Date.now(), history: trimmed }));
      } catch {
        // Still over quota; skip persisting
      }
    }
  } catch {
    // Ignore storage access errors
  }
};

const deleteFromLocalStorage = (key) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    // Ignore
  }
};

const clearAllLocalStorage = (appIdPrefix = '') => {
  try {
    if (typeof localStorage === 'undefined') return;
    const targetPrefix = LS_PREFIX + (appIdPrefix ? `${appIdPrefix}__` : '');
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(targetPrefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore
  }
};

/**
 * Load persisted undo/redo history for a specific (appId, year, month, adminScope).
 */
export const loadUndoHistory = async (key) => {
  const db = await openHistoryDb();
  if (!db) return loadFromLocalStorage(key);
  try {
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (record?.history) {
      return sanitizeHistory(record.history);
    }
    return { past: [], future: [] };
  } catch {
    return loadFromLocalStorage(key);
  }
};

/**
 * Save undo/redo history for a specific (appId, year, month, adminScope).
 */
export const saveUndoHistory = async (key, history) => {
  const clean = sanitizeHistory(history);
  const db = await openHistoryDb();
  if (!db) {
    saveToLocalStorage(key, clean);
    return;
  }
  try {
    if (clean.past.length === 0 && clean.future.length === 0) {
      await deleteUndoHistory(key);
      return;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        key,
        updatedAt: Date.now(),
        history: clean,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await pruneOldIdbBuckets(db);
  } catch {
    saveToLocalStorage(key, clean);
  }
};

/**
 * Delete persisted undo/redo history for a single (appId, year, month, adminScope).
 */
export const deleteUndoHistory = async (key) => {
  deleteFromLocalStorage(key);
  const db = await openHistoryDb();
  if (!db) return;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
};

/**
 * Delete ALL persisted undo/redo histories for the given appId (used after shift code migration).
 */
export const clearAllUndoHistories = async (appId = '') => {
  clearAllLocalStorage(appId);
  const db = await openHistoryDb();
  if (!db) return;
  try {
    const prefix = appId ? `${String(appId)}__` : '';
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const allKeys = await new Promise((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    allKeys.forEach((k) => {
      if (!prefix || String(k).startsWith(prefix)) {
        store.delete(k);
      }
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
};
