// Texture cache keyed by AssetRef. Double-buffered to support hot reload
// without flicker (M8).

import { Texture } from "pixi.js";

import type { AssetRef } from "@/model/types";

const cache = new Map<string, Texture>();

function key(ref: AssetRef): string {
  return `${ref.assetId}/${ref.file}`;
}

export function getCached(ref: AssetRef): Texture | undefined {
  return cache.get(key(ref));
}

export function setCached(ref: AssetRef, tex: Texture): void {
  cache.set(key(ref), tex);
}

export function clearCache(): void {
  for (const t of cache.values()) t.destroy(true);
  cache.clear();
}
