// Thin wrapper over Tauri's invoke. State never crosses IPC — only bytes
// and paths.

import { invoke } from "@tauri-apps/api/core";

export interface ProjectFile {
  root: string;
  json: string;
}

export const ipc = {
  projectOpen: (path: string) => invoke<ProjectFile>("project_open", { path }),
  projectSave: (path: string, json: string) => invoke<void>("project_save", { path, json }),
  assetImport: (projectRoot: string, src: string) =>
    invoke<string>("asset_import", { projectRoot, src }),
  assetRead: (projectRoot: string, assetId: string) =>
    invoke<number[]>("asset_read", { projectRoot, assetId }),
  audioRead: (projectRoot: string, trackId: string) =>
    invoke<number[]>("audio_read", { projectRoot, trackId }),
  watchAssets: (projectRoot: string) => invoke<void>("watch_assets", { projectRoot }),
  exportStart: (req: {
    projectRoot: string;
    outPath: string;
    fps: number;
    width: number;
    height: number;
  }) => invoke<string>("export_start", { req }),
  exportCancel: (jobId: string) => invoke<void>("export_cancel", { jobId }),
};

/** Detect whether we're running inside a Tauri webview (vs a plain browser). */
export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
