# Architecture

## Process model

Frog Animator is an Electron app, so it runs in three OS-level processes:

- **Main** (`src/main/`) — owns the BrowserWindow, registers IPC handlers,
  and is the only process with Node.js / native filesystem access.
- **Preload** (`src/preload/`) — runs in the renderer's process but with
  Node access. It uses `contextBridge.exposeInMainWorld` to expose a small,
  typed API on `window.frog`. The renderer cannot reach the FS or IPC
  directly; it has to go through this bridge.
- **Renderer** (`src/renderer/`) — the React app, the PixiJS canvas, the
  domain model, IndexedDB-backed autosave, PSD parsing, MP4 muxing. Runs
  in a sandboxed Chromium with `contextIsolation: true`.

Shared types between main and renderer live in `src/shared/`.

## Why Electron (and not Tauri or "just a website")

The PRD requires WebGL 2 and WebCodecs. WebCodecs in particular is shaky
on system webviews (notably WebKitGTK on Linux and older WKWebView on
macOS), which Tauri uses. Electron bundles its own Chromium, so we get
guaranteed feature parity across operating systems and we don't have to
test against three different webview vendors.

A plain hosted website would also work, but the user asked for a desktop
app that uses local resources directly: native file dialogs for opening
PSDs and writing MP4s, no quota-bound IndexedDB cap on project bundles,
and the option to drop down into Node-side native modules later (e.g. an
ffmpeg sidecar if WebCodecs throughput becomes a bottleneck for 4K export
per NFR-4).

## Renderer modules

```
src/renderer/
  app/           React UI: layout shell, panels, dialogs
    panels/      Five panels — Asset, Layers, Properties, Timeline, Viewport
  domain/        Pure data: types, factories, easing, sampleTrack
  platform/      Browser-capability gate, IndexedDB, native-FS bridge
  types/         Ambient types (window.frog)
```

The **domain** layer is React-free and PixiJS-free. It defines the
serializable shape of a project: assets, compositions, layer trees,
keyframe tracks. Pure functions evaluate a track at time `t`.

The **platform** layer hides browser/Electron specifics:
`browserSupport.ts` runs the capability gate (NFR-6); `storage.ts` wraps
IndexedDB for autosave (NFR-8/9); `nativeFs.ts` calls the preload bridge
to read/write project bundles and image files on disk.

The **app** layer is React. Panels subscribe to the editor store
(Zustand, to be added) and dispatch domain mutations.

## Render pipeline

The Viewport hosts a PixiJS `Application`. Each frame, we walk the
composition's layer tree, sample every active track at the current
playhead time, and update the Pixi display tree to match. PixiJS is
WebGL2-backed, so transform/opacity/blur/glow/shadow filters all run on
the GPU.

For final MP4 export, we render frames at full resolution into an
offscreen canvas, feed each frame to a WebCodecs `VideoEncoder`, and mux
the encoded chunks with `mp4-muxer`. The resulting MP4 buffer is written
to disk via the preload bridge (no DOM file-download workaround).

## Storage layers

Two distinct stores, with different roles:

| Store        | Where                              | Used for                                           |
| ------------ | ---------------------------------- | -------------------------------------------------- |
| IndexedDB    | renderer, in app's user-data dir   | Autosave, asset blob cache, template library       |
| Native FS    | main process via IPC               | User-initiated project export, MP4 output, imports |

Autosave never prompts. Project export and MP4 render go through the OS
save dialog.

## Why this layout will scale to the rest of the PRD

- The domain types already cover every animatable property and every
  layer kind the PRD lists (FR-4.\*, FR-5.\*, FR-6.\*).
- The IPC bridge already covers every native file operation the PRD
  lists (PSD import, project save/load, MP4 output).
- The browser-support gate already covers NFR-6.
- The renderer is a single SPA inside one BrowserWindow, so adding
  panels, dialogs, and editor state is a normal React build-out from
  here.
