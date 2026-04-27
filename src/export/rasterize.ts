// Headless Pixi rasterizer for export. Resolves frame i, renders to an
// offscreen Application, extracts PNG bytes. Wired in M7.

export async function rasterizeFrame(_frameIndex: number): Promise<Uint8Array> {
  throw new Error("export/rasterize: not implemented (M7)");
}
