import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "@/App";
import { useStore } from "@/state/store";
import { deserialize, serialize } from "@/project/serialize";
import "@/index.css";

// Exposed for smoke tests and devtools. The Tauri webview is sealed, so
// there's no public surface to worry about.
type DebugWindow = {
  __frogStore: typeof useStore;
  __frogProject: { serialize: typeof serialize; deserialize: typeof deserialize };
};
(window as unknown as DebugWindow).__frogStore = useStore;
(window as unknown as DebugWindow).__frogProject = { serialize, deserialize };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
