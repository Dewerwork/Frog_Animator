// Procedural placeholder textures — used by M1 before real asset import lands.
// Drawn once with Canvas2D, wrapped as a Pixi Texture.

import { Texture } from "pixi.js";

let frogCache: Texture | null = null;

export function getBuiltinFrogTexture(): Texture {
  if (frogCache) return frogCache;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2D not available");

  // Body
  ctx.fillStyle = "#5cc8a6";
  ctx.beginPath();
  ctx.ellipse(128, 150, 90, 70, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = "#e8f7ee";
  ctx.beginPath();
  ctx.ellipse(128, 170, 55, 38, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (whites)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(95, 90, 26, 0, Math.PI * 2);
  ctx.arc(161, 90, 26, 0, Math.PI * 2);
  ctx.fill();

  // Eye outline
  ctx.strokeStyle = "#2d6b56";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(95, 90, 26, 0, Math.PI * 2);
  ctx.arc(161, 90, 26, 0, Math.PI * 2);
  ctx.stroke();

  // Pupils
  ctx.fillStyle = "#1a1a1f";
  ctx.beginPath();
  ctx.arc(98, 92, 10, 0, Math.PI * 2);
  ctx.arc(164, 92, 10, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = "#2d6b56";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(128, 150, 38, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  frogCache = Texture.from(canvas);
  return frogCache;
}

export function isBuiltin(assetId: string): boolean {
  return assetId.startsWith("builtin:");
}

export function getBuiltinTexture(assetId: string): Texture {
  if (assetId === "builtin:frog") return getBuiltinFrogTexture();
  throw new Error(`Unknown builtin asset: ${assetId}`);
}
