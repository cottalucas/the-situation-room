/**
 * Firebase init from env. When the config is absent (no .env.local) the app
 * runs in local mode: seed data, no auth gate. As soon as the env vars are set
 * the app switches to Firestore plus Auth with no code change.
 *
 * Never commit keys. Values come from .env.local (gitignored). See .env.example.
 */

import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported, logEvent, setCurrentScreen, setUserId } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const env = import.meta.env || {};

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const isConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
export const localPreviewEnabled = !isConfigured && env.VITE_ENABLE_LOCAL_PREVIEW === "true";

export const app = isConfigured ? initializeApp(config) : null;
export const auth = isConfigured ? getAuth(app) : null;
export const db = isConfigured ? getFirestore(app) : null;

const analyticsPromise =
  isConfigured && config.measurementId
    ? isSupported()
        .then((supported) => (supported ? getAnalytics(app) : null))
        .catch(() => null)
    : Promise.resolve(null);

const appCheckSiteKey = env.VITE_FIREBASE_APPCHECK_SITE_KEY;
const appCheckDebugToken = env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;

if (isConfigured && appCheckDebugToken && typeof globalThis !== "undefined") {
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
}

export const appCheck =
  isConfigured && appCheckSiteKey
    ? initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      })
    : null;

// Keys that must never reach Pendo/Novus: raw identifiers for a colleague,
// room, or decision, and any field that could carry note or prompt content.
// Firebase Analytics keeps the full params; only the Pendo copy is scrubbed.
const PENDO_DENY_KEYS = ["personId", "roomId", "decisionId", "name", "noteText", "text", "prompt", "body", "email"];

function pendoSafeParams(params) {
  const safe = {};
  for (const key of Object.keys(params)) {
    if (!PENDO_DENY_KEYS.includes(key)) safe[key] = params[key];
  }
  return safe;
}

export async function trackEvent(name, params = {}) {
  const analytics = await analyticsPromise;
  if (analytics) logEvent(analytics, name, params);
  try {
    if (typeof pendo !== "undefined" && typeof pendo.track === "function") {
      pendo.track(name, pendoSafeParams(params));
    }
  } catch {
    // Pendo is best-effort; never block the UI.
  }
}

/**
 * Fire a product event to both Firebase Analytics and Novus (Pendo), fire and
 * forget. Use only privacy-safe payloads: ids, counts, and enum values, never
 * raw names, notes, or edge details. Delivery to Pendo and the payload scrub
 * (room/decision/person ids stripped before Pendo, kept for Firebase) both live
 * in trackEvent, so this delegates rather than calling pendo.track again, which
 * would double-count network events and bypass the scrub.
 */
export function trackNetwork(name, params = {}) {
  trackEvent(name, params);
}

export async function trackScreen(screenName) {
  const analytics = await analyticsPromise;
  if (!analytics) return;
  setCurrentScreen(analytics, screenName);
  logEvent(analytics, "screen_view", { firebase_screen: screenName });
}

export async function setAnalyticsUser(userId) {
  const analytics = await analyticsPromise;
  if (!analytics) return;
  setUserId(analytics, userId || null);
}
