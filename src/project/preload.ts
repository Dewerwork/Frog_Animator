// Walks the project's wardrobe variants and warms textureCache for each
// non-builtin asset so compose() can resolve textures synchronously.

import { Texture } from "pixi.js";

import type { AssetRef, Project } from "@/model/types";
import { convertFileSrc, ipc } from "@/ipc/tauri";
import { isBuiltin } from "@/render/builtin";
import { getCached, setCached } from "@/render/textureCache";

async function loadOne(projectRoot: string, ref: AssetRef): Promise<void> {
  if (isBuiltin(ref.assetId)) return;
  if (getCached(ref)) return;
  // Resolve the absolute path on disk, then hand it to Pixi as a URL via
  // Tauri's asset protocol. No bytes cross the IPC boundary for the texture.
  const absPath = await ipc.assetPath(projectRoot, ref.assetId, ref.file);
  const url = convertFileSrc(absPath);
  const tex = await Texture.from(url);
  setCached(ref, tex);
}

export async function preloadProjectAssets(projectRoot: string, project: Project): Promise<void> {
  const refs: AssetRef[] = [];
  const seen = new Set<string>();
  for (const c of project.scene.characters) {
    for (const l of c.layers) {
      for (const v of l.wardrobe) {
        const key = `${v.asset.assetId}/${v.asset.file}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push(v.asset);
      }
    }
  }
  if (project.scene.background) {
    for (const v of project.scene.background.variants) {
      const key = `${v.asset.assetId}/${v.asset.file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(v.asset);
    }
  }
  await Promise.allSettled(refs.map((r) => loadOne(projectRoot, r)));
}
