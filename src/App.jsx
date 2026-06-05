import React, { useState, useEffect } from "react";
import Landing from "./views/Landing.jsx";
import Room from "./views/Room.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { signOutUser } from "./lib/auth.js";
import { trackScreen } from "./lib/firebase.js";
import * as store from "./lib/store.js";

const LOCAL_PREVIEW_VIEW_KEY = "situation-room-local-preview-view-v1";

function readLocalPreviewView() {
  if (typeof window === "undefined") return "landing";
  if (window.location.hash.startsWith("#/")) return "app";
  try {
    return window.localStorage?.getItem(LOCAL_PREVIEW_VIEW_KEY) === "app" ? "app" : "landing";
  } catch {
    return "landing";
  }
}

function writeLocalPreviewView(view) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(LOCAL_PREVIEW_VIEW_KEY, view === "app" ? "app" : "landing");
  } catch {
    // Local preview still works for the current session if browser storage is unavailable.
  }
}

/**
 * Router and auth gate.
 *   Configured (Firebase env set): landing is public, the room requires a signed
 *   in user, and the store connects to Firestore for that user.
 *   Not configured (local mode): a view flag stands in, no auth, seed data.
 */
export default function App() {
  const { user, status, configured, localPreview } = useAuth();
  const [localView, setLocalView] = useState(readLocalPreviewView);

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

  useEffect(() => {
    if (localPreview) writeLocalPreviewView(localView);
  }, [localPreview, localView]);

  const signOut = async () => {
    await signOutUser();
    await store.disconnect();
    setLocalView("landing");
  };

  const enterLocalPreview = () => {
    writeLocalPreviewView("app");
    if (typeof window !== "undefined" && !window.location.hash.startsWith("#/")) {
      window.location.hash = "#/";
    }
    setLocalView("app");
  };

  const exitLocalPreview = () => {
    writeLocalPreviewView("landing");
    if (typeof window !== "undefined" && window.location.hash.startsWith("#/")) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
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
    return <Room onExit={signOut} userId={user?.uid} userName={user?.displayName} userEmail={user?.email} />;
  }

  if (!localPreview) {
    return <Landing configured={false} localPreview={false} onLocalEnter={() => {}} />;
  }

  // Explicit local preview mode
  return localView === "landing" ? (
    <Landing configured={false} localPreview onLocalEnter={enterLocalPreview} />
  ) : (
    <Room onExit={exitLocalPreview} />
  );
}
