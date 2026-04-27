import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "@/App";
import { useStore } from "@/state/store";
import { deserialize, serialize } from "@/project/serialize";
import { canRedo, canUndo, redo, undo } from "@/state/history";
import { createRasterizer, rasterizeFrame } from "@/export/rasterize";
import {
  resolvePoseCached,
  resolvedPoseCacheSize,
  clearResolvedPoseCache,
} from "@/rig/resolve";
import "@/index.css";

// Exposed for smoke tests and devtools. The Tauri webview is sealed, so
// there's no public surface to worry about.
type DebugWindow = {
  __frogStore: typeof useStore;
  __frogProject: { serialize: typeof serialize; deserialize: typeof deserialize };
  __frogHistory: { undo: typeof undo; redo: typeof redo; canUndo: typeof canUndo; canRedo: typeof canRedo };
  __frogRasterize: { createRasterizer: typeof createRasterizer; rasterizeFrame: typeof rasterizeFrame };
  __frogResolve: {
    resolvePoseCached: typeof resolvePoseCached;
    resolvedPoseCacheSize: typeof resolvedPoseCacheSize;
    clearResolvedPoseCache: typeof clearResolvedPoseCache;
  };
};
const dbg = window as unknown as DebugWindow;
dbg.__frogStore = useStore;
dbg.__frogProject = { serialize, deserialize };
dbg.__frogHistory = { undo, redo, canUndo, canRedo };
dbg.__frogRasterize = { createRasterizer, rasterizeFrame };
dbg.__frogResolve = { resolvePoseCached, resolvedPoseCacheSize, clearResolvedPoseCache };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
