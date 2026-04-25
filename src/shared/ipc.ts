/**
 * IPC channel names and payload types shared between the Electron main
 * process and the renderer. The preload script exposes a typed API on
 * `window.frog` that wraps these channels — see src/preload/index.ts.
 */

export const IPC = {
  // Filesystem dialogs / IO
  showOpenImageDialog: 'fs:showOpenImageDialog',
  showSaveMp4Dialog: 'fs:showSaveMp4Dialog',
  showSaveProjectDialog: 'fs:showSaveProjectDialog',
  showOpenProjectDialog: 'fs:showOpenProjectDialog',

  readFileAsBuffer: 'fs:readFileAsBuffer',
  writeFileBuffer: 'fs:writeFileBuffer',

  // App metadata
  getAppPaths: 'app:getPaths',
} as const;

export type AppPaths = {
  userData: string;
  documents: string;
  temp: string;
};

export type ImageFileFilter = 'images' | 'psd' | 'imagesAndPsd';

export type DialogResult<T> = { canceled: true } | { canceled: false; value: T };
