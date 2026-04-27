// Procedural placeholder textures — used by M1 before real asset import lands.
// Drawn once with Canvas2D, wrapped as a Pixi Texture.

import { Texture } from "pixi.js";

const cache = new Map<string, Texture>();

function newCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2D not available");
  return { canvas, ctx };
}

function buildFrogTexture(): Texture {
  const { canvas, ctx } = newCanvas(256);

  ctx.fillStyle = "#5cc8a6";
  ctx.beginPath();
  ctx.ellipse(128, 150, 90, 70, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e8f7ee";
  ctx.beginPath();
  ctx.ellipse(128, 170, 55, 38, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(95, 90, 26, 0, Math.PI * 2);
  ctx.arc(161, 90, 26, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2d6b56";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(95, 90, 26, 0, Math.PI * 2);
  ctx.arc(161, 90, 26, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#1a1a1f";
  ctx.beginPath();
  ctx.arc(98, 92, 10, 0, Math.PI * 2);
  ctx.arc(164, 92, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2d6b56";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(128, 150, 38, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  return Texture.from(canvas);
}

function buildEyeTexture(): Texture {
  // 64x64 — small highlight glint, opaque white circle with a soft edge.
  const { canvas, ctx } = newCanvas(64);
  const grd = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.6, "rgba(255,255,255,0.85)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  return Texture.from(canvas);
}

function buildPlaceholderTexture(): Texture {
  // 256x256 — magenta/black checkerboard so unloaded assets are obvious.
  const { canvas, ctx } = newCanvas(256);
  ctx.fillStyle = "#ff00ff";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 252);
  return Texture.from(canvas);
}

const builders: Record<string, () => Texture> = {
  "builtin:frog": buildFrogTexture,
  "builtin:eye": buildEyeTexture,
  "builtin:placeholder": buildPlaceholderTexture,
};

export function isBuiltin(assetId: string): boolean {
  return assetId.startsWith("builtin:");
}

export function getBuiltinTexture(assetId: string): Texture {
  let tex = cache.get(assetId);
  if (tex) return tex;
  const build = builders[assetId];
  if (!build) {
    // Unknown builtin → fall back to placeholder so we never throw mid-compose.
    tex = builders["builtin:placeholder"]();
  } else {
    tex = build();
  }
  cache.set(assetId, tex);
  return tex;
}
