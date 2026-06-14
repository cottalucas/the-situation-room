import { useState, useEffect } from "react";
import { onAuthChange, completeRedirectSignIn } from "../lib/auth.js";
import { isConfigured, localPreviewEnabled } from "../lib/firebase.js";
import { getUserProfile } from "../lib/firestore-repo.js";

// Module-scoped so it persists across auth state changes within a session:
// Pendo is initialised once, then identify() handles later changes.
let pendoInitialized = false;

/**
 * Auth state for gating.
 *   status: "loading" | "in" | "out"
 *   user:   the Firebase user, or null.
 * In local mode (Firebase not configured) status resolves to "out" and the app
 * lets you in without an account.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(isConfigured ? "loading" : "out");

  useEffect(() => {
    completeRedirectSignIn().catch(() => {});
    const unsub = onAuthChange((u) => {
      setUser(u);
      setStatus(u ? "in" : "out");

      if (u) {
        // Identify the signed-in user to Pendo with all available metadata.
        // First auth of the session initialises; later changes re-identify.
        const sendToPendo = (visitorPayload) => {
          try {
            if (typeof pendo === "undefined") return;
            if (!pendoInitialized) {
              pendo.initialize(visitorPayload);
              pendoInitialized = true;
            } else {
              pendo.identify(visitorPayload);
            }
          } catch {
            // Pendo is fire-and-forget; never block auth on analytics.
          }
        };
        getUserProfile(u.uid).then((profile) => {
          sendToPendo({
            visitor: {
              id: u.uid,
              email: u.email || profile.email || '',
              full_name: profile.name || u.displayName || '',
              position: profile.position || '',
            },
            account: { id: u.uid },
          });
        }).catch(() => {
          // Fall back to Firebase Auth fields only.
          sendToPendo({
            visitor: {
              id: u.uid,
              email: u.email || '',
              full_name: u.displayName || '',
              position: '',
            },
            account: { id: u.uid },
          });
        });
      }
    });
    return unsub;
  }, []);

  return { user, status, configured: isConfigured, localPreview: localPreviewEnabled };
}
