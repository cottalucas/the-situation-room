/**
 * Firebase init stub. Not connected.
 *
 * When we wire Firebase:
 *   1. npm install firebase
 *   2. fill the config below from the Firebase console (use env vars, never commit keys)
 *   3. uncomment the init and exports
 *   4. implement the Firestore versions of the functions in lib/store.js
 *   5. gate the app: landing is public, the room view requires an authed user
 *
 * TODO: add Firebase config and init.
 */

// import { initializeApp } from "firebase/app";
// import { getAuth } from "firebase/auth";
// import { getFirestore } from "firebase/firestore";

// const firebaseConfig = {
//   apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
//   authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
//   projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
//   storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
//   messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
//   appId: import.meta.env.VITE_FIREBASE_APP_ID,
// };

// export const app = initializeApp(firebaseConfig);
// export const auth = getAuth(app);
// export const db = getFirestore(app);

/**
 * Planned Firestore shape:
 *   rooms/{roomId}                         { name, rosterIds, ownerId }
 *   rooms/{roomId}/decisions/{decisionId}  { title, context, status, deadline,
 *                                            participantIds, externalIds, positions }
 *   people/{personId}                      global profile (read, goal, notes, history)
 *   rooms/{roomId}/edges/{edgeId}          { from, to, type }
 *   decisions/{decisionId}/chat/{msgId}    conversation history
 *
 * Auth gating wraps the room view (see App.jsx). Landing stays public.
 */

export const isConfigured = false;
