/**
 * Encrypted local cache, IndexedDB backed.
 *
 * This is a cache, not the store of record. Firebase becomes the source of
 * record at the auth pass; this layer stays in front for fast load and session
 * consistency. The snapshot is encrypted at rest (see lib/crypto.js).
 */

import { encryptJSON, decryptJSON } from "./crypto.js";

const DB_NAME = "tsr";
const STORE = "state";
const KEY = "snapshot";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

/** Persist an encrypted snapshot. Fails quietly; the cache is best effort. */
export async function saveCache(state) {
  try {
    const payload = await encryptJSON(state);
    const db = await openDB();
    await tx(db, "readwrite", (s) => s.put(payload, KEY));
  } catch {
    /* cache write failed, in memory state is still correct */
  }
}

/** Load and decrypt the snapshot, or null if absent or unreadable. */
export async function loadCache() {
  try {
    const db = await openDB();
    const payload = await tx(db, "readonly", (s) => s.get(KEY));
    if (!payload) return null;
    return await decryptJSON(payload);
  } catch {
    return null;
  }
}

/** Wipe the cache. Used on sign out later. */
export async function clearCache() {
  try {
    const db = await openDB();
    await tx(db, "readwrite", (s) => s.delete(KEY));
  } catch {
    /* ignore */
  }
}
