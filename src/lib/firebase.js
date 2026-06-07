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

export async function trackEvent(name, params = {}) {
  const analytics = await analyticsPromise;
  if (!analytics) return;
  logEvent(analytics, name, params);
}

/**
 * Fire a product event to both Firebase Analytics and Novus (Pendo), fire and
 * forget. Use only privacy-safe payloads: ids, counts, and enum values, never
 * raw names, notes, or edge details.
 */
export function trackNetwork(name, params = {}) {
  trackEvent(name, params);
  try {
    if (typeof pendo !== "undefined" && typeof pendo.track === "function") pendo.track(name, params);
  } catch {
    // Novus is best-effort; never block the UI on analytics.
  }
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
