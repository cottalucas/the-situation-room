import { useState, useEffect } from "react";
import { onAuthChange, completeRedirectSignIn } from "../lib/auth.js";
import { isConfigured, localPreviewEnabled } from "../lib/firebase.js";

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
    });
    return unsub;
  }, []);

  return { user, status, configured: isConfigured, localPreview: localPreviewEnabled };
}
