/**
 * AES-GCM encryption for data at rest, via the Web Crypto API.
 *
 * The cache holds notes, person context, and history, which describe real
 * colleagues. We encrypt the whole serialized snapshot so every personal field
 * is covered at rest.
 *
 * TODO: derive the key from the authed user at the auth pass. For now we hold a
 * device local key in localStorage so the cache survives reloads.
 */

const KEY_STORAGE = "tsr.cacheKey.v1";

const b64 = {
  encode(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  },
  decode(str) {
    return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  },
};

let keyPromise = null;

/** Get or create the device local AES-GCM key. */
export function getKey() {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (stored) {
      return crypto.subtle.importKey("raw", b64.decode(stored), "AES-GCM", true, [
        "encrypt",
        "decrypt",
      ]);
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const raw = await crypto.subtle.exportKey("raw", key);
    localStorage.setItem(KEY_STORAGE, b64.encode(raw));
    return key;
  })();
  return keyPromise;
}

/** Encrypt a JSON serializable value. Returns { iv, ct } as base64 strings. */
export async function encryptJSON(value) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv: b64.encode(iv), ct: b64.encode(ct) };
}

/** Decrypt a { iv, ct } payload back to its value, or null on failure. */
export async function decryptJSON(payload) {
  try {
    const key = await getKey();
    const iv = b64.decode(payload.iv);
    const ct = b64.decode(payload.ct);
    const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    return null;
  }
}
