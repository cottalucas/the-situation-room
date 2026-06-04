import React, { useState, useEffect } from "react";
import Landing from "./views/Landing.jsx";
import Room from "./views/Room.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { signOutUser } from "./lib/auth.js";
import { trackScreen } from "./lib/firebase.js";
import * as store from "./lib/store.js";

/**
 * Router and auth gate.
 *   Configured (Firebase env set): landing is public, the room requires a signed
 *   in user, and the store connects to Firestore for that user.
 *   Not configured (local mode): a view flag stands in, no auth, seed data.
 */
export default function App() {
  const { user, status, configured, localPreview } = useAuth();
  const [localView, setLocalView] = useState("landing");

  // Connect the store to Firestore for the signed in user.
  useEffect(() => {
    if (!configured) return;
    if (user) store.connect(user.uid);
    else if (status === "out") store.disconnect();
  }, [configured, status, user]);

  useEffect(() => {
    if (configured && status === "loading") return;
    trackScreen(configured && user ? "room" : localView);
  }, [configured, localView, status, user]);

  const signOut = async () => {
    await signOutUser();
    await store.disconnect();
    setLocalView("landing");
  };

  if (configured) {
    if (status === "loading") {
      return (
        <div className="splash">
          <span className="splash-mark">The Situation Room</span>
        </div>
      );
    }
    if (status === "out") return <Landing configured onLocalEnter={() => {}} />;
    return <Room onExit={signOut} userId={user?.uid} />;
  }

  if (!localPreview) {
    return <Landing configured={false} localPreview={false} onLocalEnter={() => {}} />;
  }

  // Explicit local preview mode
  return localView === "landing" ? (
    <Landing configured={false} localPreview onLocalEnter={() => setLocalView("app")} />
  ) : (
    <Room onExit={() => setLocalView("landing")} />
  );
}
