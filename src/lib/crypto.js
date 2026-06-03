/**
 * AES-GCM encryption for personal text at rest, via the Web Crypto API.
 *
 * The active key is derived from the authed user id with PBKDF2, so the same
 * user decrypts on any device. In local mode (no auth) a device key in
 * localStorage is used instead.
 *
 * Threat model: this protects the data at rest in Firestore and the local cache
 * against casual inspection and meets "encrypted at rest". It is not zero
 * knowledge, since the key derives from the uid which the server knows. For true
 * end to end secrecy, derive the key from a user passphrase. Tracked in roadmap.
 */

const DEVICE_KEY = "tsr.deviceKey.v1";
// App scoped salt. Not secret; PBKDF2 salts only need to be unique per app.
const SALT = new TextEncoder().encode("the-situation-room.v1");

const b64 = {
  encode: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  decode: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};

let activeKey = null; // Promise<CryptoKey>

/** Derive the per user key from the uid. Called on sign in. */
export function setUserKey(uid) {
  activeKey = (async () => {
    const base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(uid),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: SALT, iterations: 100000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  })();
}

/** Clear the key on sign out. Local mode falls back to the device key. */
export function clearUserKey() {
  activeKey = null;
}

function deviceKey() {
  return (async () => {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) {
      return crypto.subtle.importKey("raw", b64.decode(stored), "AES-GCM", true, ["encrypt", "decrypt"]);
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = await crypto.subtle.exportKey("raw", key);
    localStorage.setItem(DEVICE_KEY, b64.encode(raw));
    return key;
  })();
}

function getKey() {
  return activeKey || deviceKey();
}

/** Encrypt a string. Returns "iv:ct" base64, or the input if empty. */
export async function encryptText(text) {
  if (text == null || text === "") return text;
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return `${b64.encode(iv)}:${b64.encode(ct)}`;
}

/** Decrypt "iv:ct". Returns plaintext, or the input if it is not encrypted. */
export async function decryptText(value) {
  if (typeof value !== "string" || !value.includes(":")) return value;
  try {
    const [iv, ct] = value.split(":");
    const key = await getKey();
    const data = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64.decode(iv) },
      key,
      b64.decode(ct)
    );
    return new TextDecoder().decode(data);
  } catch {
    return value;
  }
}

/* JSON blob helpers for the local cache (whole snapshot encryption). */

export async function encryptJSON(value) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv: b64.encode(iv), ct: b64.encode(ct) };
}

export async function decryptJSON(payload) {
  try {
    const key = await getKey();
    const data = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64.decode(payload.iv) },
      key,
      b64.decode(payload.ct)
    );
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    return null;
  }
}
