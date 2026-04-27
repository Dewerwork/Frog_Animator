// Hot-reload textures when the watcher reports a change. Cache-busts the
// Tauri asset URL with the change mtime so the renderer fetches fresh
// bytes, then swaps the cached Pixi Texture in place.

import { Texture } from "pixi.js";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { convertFileSrc, ipc, inTauri } from "@/ipc/tauri";
import { useStore } from "@/state/store";
import { setCached } from "@/render/textureCache";

interface AssetChangedEvent {
  assetId: string;
  file: string;
  mtimeMs: number;
}

let unlisten: UnlistenFn | null = null;

export async function startHotReload(): Promise<void> {
  if (!inTauri()) return;
  await stopHotReload();
  unlisten = await listen<AssetChangedEvent>("assets:changed", async (e) => {
    const projectRoot = useStore.getState().projectRoot;
    if (!projectRoot) return;
    const { assetId, file, mtimeMs } = e.payload;

    try {
      const absPath = await ipc.assetPath(projectRoot, assetId, file);
      // Cache-bust both the browser fetch cache and Pixi's TextureSource
      // cache. We use a fresh URL each reload.
      const url = `${convertFileSrc(absPath)}?t=${mtimeMs}`;
      const tex = await Texture.from(url);
      setCached({ assetId, file }, tex);
      // Force a redraw by tickling the store. We use setSelection to its
      // current value to avoid changing observable behavior.
      const sel = useStore.getState().selection;
      useStore.setState({ selection: [...sel] });
    } catch (err) {
      console.warn(`hot reload failed for ${assetId}/${file}:`, err);
    }
  });
}

export async function stopHotReload(): Promise<void> {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
}

export async function startWatching(projectRoot: string): Promise<void> {
  if (!inTauri()) return;
  try {
    await ipc.watchAssets(projectRoot);
  } catch (e) {
    console.warn("watch_assets failed:", e);
  }
}
