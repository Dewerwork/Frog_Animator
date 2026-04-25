# Frog Animator

Desktop motion graphics tool for cutout-style 2D animation, built for solo
YouTube creators who prepare assets in Photoshop and want to author + render
videos end-to-end without paying for After Effects or Moho.

This is a single-user tool — see [`docs/PRD.md`](docs/PRD.md) for the full
requirements doc.

## Stack

- **Electron 33** — packages a native desktop app around a Chromium renderer.
  Bundling Chromium is the simplest way to guarantee WebGL 2 + WebCodecs on
  every OS, which the timeline rendering and MP4 exporter both require.
- **Vite + React 18 + TypeScript** in the renderer (driven by `electron-vite`).
- **PixiJS 8** for layered WebGL2 rendering of the composition.
- **ag-psd** for parsing PSD files in the renderer.
- **mp4-muxer + WebCodecs `VideoEncoder`** for MP4 (H.264) export.
- **Zustand** for editor state, **@dnd-kit** for the layer tree.
- **IndexedDB** for autosave + asset cache; native FS for project bundles
  and MP4 output.

## Architecture

Three Electron processes:

| Process       | Source            | Responsibility                                                           |
| ------------- | ----------------- | ------------------------------------------------------------------------ |
| **main**      | `src/main/`       | Window lifecycle, native dialogs, filesystem reads/writes via IPC.       |
| **preload**   | `src/preload/`    | Exposes a typed `window.frog` API to the renderer over `contextBridge`.  |
| **renderer**  | `src/renderer/`   | The entire editor UI — React, PixiJS canvas, IndexedDB, PSD parsing.     |

Cross-process types live in `src/shared/`.

### Renderer layout

```
src/renderer/
  app/              React UI: layout shell + panels
    panels/         AssetPanel, LayersPanel, PropertiesPanel, TimelinePanel, Viewport
  domain/           Pure data model: Layer, Keyframe, Composition, Project
  platform/         Browser-capability check, IndexedDB, native-FS bridge
  types/            Ambient types (window.frog typing)
```

The domain layer has no React or PixiJS imports — it's the serializable
state of a project. The renderer's job is to project that state onto the
Pixi stage and let the user mutate it.

## Running

```bash
npm install
npm run dev          # launch Electron in dev with HMR for the renderer
npm run build        # type-check + bundle main/preload/renderer
npm run dist         # produce a platform installer via electron-builder
```

## Status

Repo scaffolding only. The four-panel editor layout, browser-support gate,
domain types, and IPC bridge are in place; PSD import, the layer tree, the
keyframe timeline, and the MP4 exporter are not implemented yet. See the
PRD's functional requirements (FR-*.*) for the build order.
