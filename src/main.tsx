import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "@/App";
import { useStore } from "@/state/store";
import "@/index.css";

// Exposed for smoke tests and devtools. The Tauri webview is sealed, so
// there's no public surface to worry about.
(window as unknown as { __frogStore: typeof useStore }).__frogStore = useStore;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
