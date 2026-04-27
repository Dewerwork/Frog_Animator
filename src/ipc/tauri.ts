// Thin wrapper over Tauri's invoke. State never crosses IPC — only bytes
// and paths.

import { invoke, convertFileSrc } from "@tauri-apps/api/core";

export interface ProjectFile {
  path: string;
  root: string;
  json: string;
}

export interface ImportedAsset {
  assetId: string;
  file: string;
  absPath: string;
}

export const ipc = {
  projectOpen: (path: string) => invoke<ProjectFile>("project_open", { path }),
  projectCreate: (path: string, initialJson: string) =>
    invoke<ProjectFile>("project_create", { path, initialJson }),
  projectSave: (path: string, json: string) => invoke<void>("project_save", { path, json }),
  assetImport: (projectRoot: string, src: string) =>
    invoke<ImportedAsset>("asset_import", { projectRoot, src }),
  assetRead: (projectRoot: string, assetId: string, file: string) =>
    invoke<number[]>("asset_read", { projectRoot, assetId, file }),
  assetPath: (projectRoot: string, assetId: string, file: string) =>
    invoke<string>("asset_path", { projectRoot, assetId, file }),
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

export { convertFileSrc };

/** Detect whether we're running inside a Tauri webview (vs a plain browser). */
export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
