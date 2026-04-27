// Decode an audio file into an AudioBuffer.

import { convertFileSrc } from "@/ipc/tauri";
import { getAudioContext } from "./context";

export async function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  return getAudioContext().decodeAudioData(bytes);
}

export async function loadTrackFromAbsPath(absPath: string): Promise<AudioBuffer> {
  const url = convertFileSrc(absPath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio load failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return decode(buf);
}

/** Load via IPC (returns raw bytes). Used in browser/test environments where
 *  convertFileSrc doesn't resolve. */
export async function loadTrackFromBytes(bytes: ArrayBuffer): Promise<AudioBuffer> {
  return decode(bytes);
}
