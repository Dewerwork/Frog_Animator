import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AppPaths,
  type DialogResult,
  type ImageFileFilter,
} from '../shared/ipc';

/**
 * Typed surface exposed to the renderer as `window.frog`. Every method here
 * is a thin wrapper around an IPC channel — the main process owns all
 * native filesystem access; the renderer never touches the FS directly.
 */
const api = {
  getAppPaths: (): Promise<AppPaths> => ipcRenderer.invoke(IPC.getAppPaths),

  showOpenImageDialog: (
    filter: ImageFileFilter = 'imagesAndPsd',
  ): Promise<DialogResult<string[]>> =>
    ipcRenderer.invoke(IPC.showOpenImageDialog, filter),

  showSaveMp4Dialog: (suggestedName: string): Promise<DialogResult<string>> =>
    ipcRenderer.invoke(IPC.showSaveMp4Dialog, suggestedName),

  showSaveProjectDialog: (
    suggestedName: string,
  ): Promise<DialogResult<string>> =>
    ipcRenderer.invoke(IPC.showSaveProjectDialog, suggestedName),

  showOpenProjectDialog: (): Promise<DialogResult<string>> =>
    ipcRenderer.invoke(IPC.showOpenProjectDialog),

  readFileAsBuffer: (path: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke(IPC.readFileAsBuffer, path),

  writeFileBuffer: (path: string, data: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke(IPC.writeFileBuffer, path, data),
} as const;

export type FrogApi = typeof api;

contextBridge.exposeInMainWorld('frog', api);
