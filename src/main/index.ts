import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { IPC, type AppPaths, type DialogResult, type ImageFileFilter } from '@shared/ipc';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Electron's GPU sandbox sometimes blocks WebGL2 on Linux without this hint.
app.commandLine.appendSwitch('enable-features', 'WebCodecs,Vulkan');
// Encourage hardware acceleration for the canvas/WebGL renderer.
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'Frog Animator',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The renderer needs WebCodecs + WebGL2; both ship in modern Electron
      // out of the box. We disable webSecurity *only* for blob: URLs through
      // the CSP, never globally.
    },
  });

  win.once('ready-to-show', () => win.show());

  // Open external links in the OS browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function buildFilters(filter: ImageFileFilter): Electron.FileFilter[] {
  switch (filter) {
    case 'images':
      return [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }];
    case 'psd':
      return [{ name: 'Photoshop', extensions: ['psd'] }];
    case 'imagesAndPsd':
      return [
        { name: 'Images & PSD', extensions: ['png', 'jpg', 'jpeg', 'webp', 'psd'] },
      ];
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.getAppPaths, (): AppPaths => ({
    userData: app.getPath('userData'),
    documents: app.getPath('documents'),
    temp: app.getPath('temp'),
  }));

  ipcMain.handle(
    IPC.showOpenImageDialog,
    async (_e, filter: ImageFileFilter): Promise<DialogResult<string[]>> => {
      const res = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: buildFilters(filter),
      });
      if (res.canceled || res.filePaths.length === 0) return { canceled: true };
      return { canceled: false, value: res.filePaths };
    },
  );

  ipcMain.handle(
    IPC.showSaveMp4Dialog,
    async (_e, suggestedName: string): Promise<DialogResult<string>> => {
      const res = await dialog.showSaveDialog({
        defaultPath: suggestedName,
        filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
      });
      if (res.canceled || !res.filePath) return { canceled: true };
      return { canceled: false, value: res.filePath };
    },
  );

  ipcMain.handle(
    IPC.showSaveProjectDialog,
    async (_e, suggestedName: string): Promise<DialogResult<string>> => {
      const res = await dialog.showSaveDialog({
        defaultPath: suggestedName,
        filters: [{ name: 'Frog Animator project', extensions: ['frog'] }],
      });
      if (res.canceled || !res.filePath) return { canceled: true };
      return { canceled: false, value: res.filePath };
    },
  );

  ipcMain.handle(
    IPC.showOpenProjectDialog,
    async (): Promise<DialogResult<string>> => {
      const res = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Frog Animator project', extensions: ['frog'] }],
      });
      if (res.canceled || res.filePaths.length === 0) return { canceled: true };
      return { canceled: false, value: res.filePaths[0]! };
    },
  );

  ipcMain.handle(IPC.readFileAsBuffer, async (_e, path: string): Promise<ArrayBuffer> => {
    const buf = await readFile(path);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });

  ipcMain.handle(
    IPC.writeFileBuffer,
    async (_e, path: string, data: ArrayBuffer): Promise<void> => {
      await writeFile(path, Buffer.from(data));
    },
  );
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
