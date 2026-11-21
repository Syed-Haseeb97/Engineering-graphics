import type { DraftState } from './types';

const DB_NAME = 'EngineeringGraphicsDraftDB';
const DB_VERSION = 1;
const STORE_NAME = 'draft_sessions';
const RECORD_KEY = 'active_draft';

// In-memory fallback if IndexedDB is unavailable in headless/node unit tests
const memoryFallback = new Map<string, DraftState>();

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error('IndexedDB is not supported in this environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB.'));
    };
  });
}

/**
 * Persist drafting state (entities, command log, timestamp) to IndexedDB.
 */
export async function saveDraftState(state: DraftState, recordKey = RECORD_KEY): Promise<void> {
  memoryFallback.set(recordKey, state);

  if (!isIndexedDBAvailable()) {
    return;
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(state, recordKey);

      req.onsuccess = () => {
        resolve();
      };
      req.onerror = () => {
        reject(req.error ?? new Error('Failed to save draft state.'));
      };
      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    console.warn('[DraftStorage] Falling back to in-memory storage:', err);
  }
}

/**
 * Restore drafting state from IndexedDB if present.
 */
export async function loadDraftState(recordKey = RECORD_KEY): Promise<DraftState | null> {
  if (!isIndexedDBAvailable()) {
    return memoryFallback.get(recordKey) ?? null;
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(recordKey);

      req.onsuccess = () => {
        const result = req.result as DraftState | undefined;
        resolve(result ?? memoryFallback.get(recordKey) ?? null);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('Failed to load draft state.'));
      };
      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    console.warn('[DraftStorage] Error loading from IndexedDB, returning memory fallback:', err);
    return memoryFallback.get(recordKey) ?? null;
  }
}

/**
 * Clear persisted draft state from IndexedDB and memory.
 */
export async function clearDraftState(recordKey = RECORD_KEY): Promise<void> {
  memoryFallback.delete(recordKey);

  if (!isIndexedDBAvailable()) {
    return;
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(recordKey);

      req.onsuccess = () => {
        resolve();
      };
      req.onerror = () => {
        reject(req.error ?? new Error('Failed to clear draft state.'));
      };
      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    console.warn('[DraftStorage] Failed to clear IndexedDB:', err);
  }
}
