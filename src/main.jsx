import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { hydrate } from "./lib/store.js";
import "./styles.css";

// Load the encrypted local cache, then let it re render. Best effort.
hydrate();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
