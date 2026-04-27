// Public history surface. The actual stack lives in state/store.ts so it
// can capture Immer patches per action. UI code imports from here.

export { undo, redo, canUndo, canRedo, historyDepth, clearHistory } from "@/state/store";
