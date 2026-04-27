// In-memory frame clipboard. Holds plain layer-delta payloads (not full
// Frame objects) — paste mints fresh ULIDs to avoid id collisions.

import type { Frame, FrameLayerState } from "@/model/types";

let buf: Array<Record<string, FrameLayerState>> = [];

export function copyFrames(frames: Frame[]): number {
  buf = frames.map((f) => JSON.parse(JSON.stringify(f.layers)));
  return buf.length;
}

export function clipboardLayers(): Array<Record<string, FrameLayerState>> {
  return buf;
}

export function clipboardSize(): number {
  return buf.length;
}

export function clearFrameClipboard(): void {
  buf = [];
}
