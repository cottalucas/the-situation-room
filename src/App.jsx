import React, { useState } from "react";
import Landing from "./views/Landing.jsx";
import Room from "./views/Room.jsx";

/**
 * Router. Landing is public; the room view is where auth gating will wrap once
 * Firebase lands (see lib/firebase.js). For now a local view flag stands in.
 *
 * TODO: replace the view flag with auth state. Landing stays public, Room
 * requires a signed in user.
 */
export default function App() {
  const [view, setView] = useState("landing");
  return view === "landing" ? (
    <Landing onEnter={() => setView("app")} />
  ) : (
    <Room onExit={() => setView("landing")} />
  );
}
