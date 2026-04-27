import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Assets } from "pixi.js";
import { ulid } from "ulid";

import { convertFileSrc, ipc, inTauri } from "@/ipc/tauri";
import { setCached } from "@/render/textureCache";
import { saveProjectAs } from "@/project/save";
import { useStore } from "@/state/store";

/**
 * Pick a PNG, copy it into <projectRoot>/assets/<id>/<file>, register a new
 * wardrobe variant on the active layer, and warm the texture cache so the
 * stage can render it immediately.
 *
 * If the project hasn't been saved yet, prompt Save As first — assets need
 * a project root to copy into.
 */
export async function importAssetForActiveLayer(): Promise<void> {
  if (!inTauri()) {
    console.warn("importAsset: not in Tauri");
    return;
  }
  let s = useStore.getState();
  if (!s.projectRoot) {
    const savedTo = await saveProjectAs();
    if (!savedTo) return; // user cancelled
    s = useStore.getState();
    if (!s.projectRoot) {
      console.warn("importAsset: still no projectRoot after save");
      return;
    }
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
  // Pixi v8: Assets.load actually fetches and decodes; Texture.from(url) looks
  // the URL up as a cache id and returns a placeholder if not pre-registered.
  const tex = await Assets.load(url);
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
