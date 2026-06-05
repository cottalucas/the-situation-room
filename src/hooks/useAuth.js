import { useState, useEffect } from "react";
import { onAuthChange, completeRedirectSignIn } from "../lib/auth.js";
import { isConfigured, localPreviewEnabled } from "../lib/firebase.js";
import { getUserProfile } from "../lib/firestore-repo.js";

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
        getUserProfile(u.uid).then((profile) => {
          pendo.identify({
            visitor: {
              id: u.uid,
              email: u.email || profile.email || '',
              full_name: profile.name || u.displayName || '',
              position: profile.position || '',
            },
          });
        }).catch(() => {
          // Fall back to Firebase Auth fields only.
          pendo.identify({
            visitor: {
              id: u.uid,
              email: u.email || '',
              full_name: u.displayName || '',
            },
          });
        });
      }
    });
    return unsub;
  }, []);

  return { user, status, configured: isConfigured, localPreview: localPreviewEnabled };
}
