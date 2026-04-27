import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Texture } from "pixi.js";
import { ulid } from "ulid";

import { convertFileSrc, ipc, inTauri } from "@/ipc/tauri";
import { setCached } from "@/render/textureCache";
import { useStore } from "@/state/store";

/**
 * Pick a PNG, copy it into <projectRoot>/assets/<id>/<file>, register a new
 * wardrobe variant on the active layer, and warm the texture cache so the
 * stage can render it immediately.
 */
export async function importAssetForActiveLayer(): Promise<void> {
  if (!inTauri()) {
    console.warn("importAsset: not in Tauri");
    return;
  }
  const s = useStore.getState();
  if (!s.projectRoot) {
    console.warn("importAsset: project not saved yet — Save As first");
    return;
  }
  // Find the active layer: first selected layer-id, or first layer of first char.
  const layerId = pickActiveLayerId(s);
  if (!layerId) return;

  const picked = await openDialog({
    title: "Import PNG",
    filters: [{ name: "PNG image", extensions: ["png"] }],
    multiple: false,
  });
  if (!picked || Array.isArray(picked)) return;

  const imported = await ipc.assetImport(s.projectRoot, picked);
  const url = convertFileSrc(imported.absPath);
  const tex = await Texture.from(url);
  setCached({ assetId: imported.assetId, file: imported.file }, tex);
  useStore.getState().addWardrobeVariant(
    layerId,
    {
      id: ulid(),
      name: imported.file,
      assetId: imported.assetId,
      file: imported.file,
    },
    true,
  );
}

function pickActiveLayerId(s: ReturnType<typeof useStore.getState>): string | null {
  if (!s.project) return null;
  for (const t of s.selection) {
    if (typeof t === "string" && !t.includes(":") && !t.startsWith("bg:")) return t;
  }
  for (const c of s.project.scene.characters) {
    if (c.layers[0]) return c.layers[0].id;
  }
  return null;
}
