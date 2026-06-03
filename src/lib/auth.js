/**
 * Auth. Email and password plus Google, on top of Firebase Auth. Each function
 * is a no op friendly stub when Firebase is not configured, so local mode runs
 * without an account.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  onAuthStateChanged,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, isConfigured, setAnalyticsUser, trackEvent } from "./firebase.js";
import { setUserKey, clearUserKey } from "./crypto.js";

let persistencePromise = null;

function ensureAuthPersistence() {
  if (!isConfigured || !auth) return Promise.resolve();
  if (!persistencePromise) persistencePromise = setPersistence(auth, browserLocalPersistence);
  return persistencePromise;
}

/** Watch auth state. Sets the encryption key on sign in. Returns unsubscribe. */
export function onAuthChange(cb) {
  if (!isConfigured) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      setUserKey(user.uid);
      setAnalyticsUser(user.uid);
    } else {
      clearUserKey();
      setAnalyticsUser(null);
    }
    cb(user);
  });
}

async function ensureUserDoc(user, name) {
  if (!db) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const data = {
    name: name || user.displayName || "",
    email: user.email || "",
  };
  if (!snap.exists()) data.createdAt = serverTimestamp();
  if (!snap.exists()) data.settings = {};
  await setDoc(ref, data, { merge: true });
}

export async function registerEmail({ name, email, password }) {
  await ensureAuthPersistence();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
  setUserKey(cred.user.uid);
  await ensureUserDoc(cred.user, name);
  trackEvent("sign_up", { method: "password" });
  return cred.user;
}

export async function signInEmail({ email, password }) {
  await ensureAuthPersistence();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  setUserKey(cred.user.uid);
  await ensureUserDoc(cred.user);
  trackEvent("login", { method: "password" });
  return cred.user;
}

export async function signInGoogle() {
  await ensureAuthPersistence();
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  setUserKey(cred.user.uid);
  await ensureUserDoc(cred.user);
  trackEvent("login", { method: "google" });
  return cred.user;
}

export async function signOutUser() {
  trackEvent("logout");
  clearUserKey();
  setAnalyticsUser(null);
  if (isConfigured) await signOut(auth);
}
