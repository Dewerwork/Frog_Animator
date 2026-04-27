import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ulid } from "ulid";

import { audioRuntime } from "@/audio/runtime";
import { loadTrackFromAbsPath } from "@/audio/decode";
import { computePeaks } from "@/audio/waveform";
import { ipc, inTauri } from "@/ipc/tauri";
import { saveProjectAs } from "@/project/save";
import { useStore } from "@/state/store";

const PEAKS_PER_SECOND = 80;

export async function importAudioTrack(): Promise<void> {
  if (!inTauri()) {
    console.warn("importAudio: not in Tauri");
    return;
  }
  let s = useStore.getState();
  if (!s.projectRoot) {
    const savedTo = await saveProjectAs();
    if (!savedTo) return;
    s = useStore.getState();
    if (!s.projectRoot) return;
  }
  const picked = await openDialog({
    title: "Import audio",
    filters: [{ name: "Audio", extensions: ["wav", "mp3", "ogg", "m4a", "flac", "aac"] }],
    multiple: false,
  });
  if (!picked || Array.isArray(picked)) return;

  const imported = await ipc.audioImport(s.projectRoot, picked);
  const buffer = await loadTrackFromAbsPath(imported.absPath);
  const peaks = computePeaks(buffer, PEAKS_PER_SECOND);
  audioRuntime.setTrack(imported.trackId, buffer, peaks);

  const id = imported.trackId;
  useStore.getState().addAudioTrack({
    id,
    name: imported.file,
    file: imported.file,
    offsetSeconds: 0,
    gainDb: 0,
    muted: false,
  });
  // Pin as a unique-id (ulid above is unused here — kept just in case the
  // Rust-side trackId clashes with an existing one, which it won't since
  // we generate fresh ULIDs server-side, but the import is idempotent).
  void ulid;
}
