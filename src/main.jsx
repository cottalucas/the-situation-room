import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { hydrate } from "./lib/store.js";
import "./styles.css";

const isLoopbackIp = window.location.hostname === "127.0.0.1";

if (isLoopbackIp) {
  const next = new URL(window.location.href);
  next.hostname = "localhost";
  window.location.replace(next.toString());
} else {
  // Load the encrypted local cache, then let it re render. Best effort.
  hydrate();

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
