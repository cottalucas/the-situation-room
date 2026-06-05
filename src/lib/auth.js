/**
 * Auth. Email and password plus Google, on top of Firebase Auth. Each function
 * is a no op friendly stub when Firebase is not configured, so local mode runs
 * without an account.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  updateProfile,
  onAuthStateChanged,
  signOut,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  setPersistence,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, isConfigured, setAnalyticsUser, trackEvent } from "./firebase.js";
import { setUserKey, clearUserKey } from "./crypto.js";

let persistencePromise = null;
const ONBOARDING_PENDING_PREFIX = "tsr:onboarding:pending:";
const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
]);

function onboardingKey(uid) {
  return `${ONBOARDING_PENDING_PREFIX}${uid}`;
}

export function markOnboardingPending(uid) {
  if (!uid || typeof localStorage === "undefined") return;
  localStorage.setItem(onboardingKey(uid), "1");
}

export function consumeOnboardingPending(uid) {
  if (!uid || typeof localStorage === "undefined") return false;
  const key = onboardingKey(uid);
  const pending = localStorage.getItem(key) === "1";
  if (pending) localStorage.removeItem(key);
  return pending;
}

function ensureAuthPersistence() {
  if (!isConfigured || !auth) return Promise.resolve();
  if (!persistencePromise) {
    persistencePromise = setPersistence(auth, browserLocalPersistence).catch(() =>
      setPersistence(auth, browserSessionPersistence).catch(() => setPersistence(auth, inMemoryPersistence))
    );
  }
  return persistencePromise;
}

function prefersRedirectSignIn() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isiOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  return isiOS || (isSafari && navigator.maxTouchPoints > 1);
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
  const isNew = !snap.exists();
  const data = { email: user.email || "" };
  if (isNew) {
    data.name = name || user.displayName || "";
    data.createdAt = serverTimestamp();
    data.settings = {};
  }
  await setDoc(ref, data, { merge: true });
  return isNew;
}

async function finishGoogleCredential(cred) {
  if (!cred?.user) return null;
  setUserKey(cred.user.uid);
  const isNew = await ensureUserDoc(cred.user);
  if (isNew) markOnboardingPending(cred.user.uid);
  trackEvent("login", { method: "google" });
  return cred.user;
}

export async function completeRedirectSignIn() {
  if (!isConfigured || !auth) return null;
  await ensureAuthPersistence();
  const cred = await getRedirectResult(auth);
  return finishGoogleCredential(cred);
}

export async function registerEmail({ name, email, password }) {
  await ensureAuthPersistence();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
  setUserKey(cred.user.uid);
  await ensureUserDoc(cred.user, name);
  markOnboardingPending(cred.user.uid);
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
  const provider = new GoogleAuthProvider();
  if (prefersRedirectSignIn()) {
    await signInWithRedirect(auth, provider);
    return null;
  }
  try {
    const cred = await signInWithPopup(auth, provider);
    return finishGoogleCredential(cred);
  } catch (err) {
    if (POPUP_FALLBACK_CODES.has(err?.code)) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

export async function signOutUser() {
  trackEvent("logout");
  clearUserKey();
  setAnalyticsUser(null);
  pendo.clearSession();
  if (isConfigured) await signOut(auth);
}
