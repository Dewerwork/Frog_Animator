import { useEffect, useRef, useState } from "react";

import type { AudioTrack } from "@/model/types";
import { audioRuntime } from "@/audio/runtime";
import { drawWaveform } from "@/audio/waveform";
import { importAudioTrack } from "@/project/importAudio";
import { useStore } from "@/state/store";

export function AudioPanel() {
  const project = useStore((s) => s.project);
  const tracks = project?.scene.audio ?? [];

  return (
    <div className="flex h-full flex-col bg-panel2 text-xs">
      <div className="flex items-center justify-between border-b border-edge px-2 py-1">
        <span className="font-medium text-ink/80">Audio</span>
        <button
          onClick={() => void importAudioTrack()}
          className="rounded border border-edge px-2 py-0.5 text-ink/70 hover:text-ink"
          title="Import audio file"
        >
          + Audio
        </button>
      </div>
      <div className="flex flex-col gap-1 overflow-auto p-1">
        {tracks.length === 0 ? (
          <div className="p-2 text-ink/40">No audio tracks. Click + Audio to import.</div>
        ) : (
          tracks.map((t) => <TrackRow key={t.id} track={t} />)
        )}
      </div>
    </div>
  );
}

function TrackRow({ track }: { track: AudioTrack }) {
  const setAudioOffset = useStore((s) => s.setAudioOffset);
  const setAudioGain = useStore((s) => s.setAudioGain);
  const setAudioMuted = useStore((s) => s.setAudioMuted);
  const renameAudioTrack = useStore((s) => s.renameAudioTrack);
  const deleteAudioTrack = useStore((s) => s.deleteAudioTrack);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const peaks = audioRuntime.getPeaks(track.id);
    if (peaks) drawWaveform(c, peaks);
    else {
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#23232b";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#666";
        ctx.font = "10px sans-serif";
        ctx.fillText("(not loaded)", 6, 16);
      }
    }
  }, [track.id]);

  const duration = audioRuntime.getDuration(track.id);

  return (
    <div className="rounded border border-edge bg-panel/40 p-1">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setAudioMuted(track.id, !track.muted)}
          className={`rounded border px-1.5 ${
            track.muted ? "border-red-300 text-red-300" : "border-edge text-ink/80"
          }`}
          title={track.muted ? "Muted — click to unmute" : "Mute"}
        >
          {track.muted ? "M" : "♪"}
        </button>
        {editing ? (
          <input
            autoFocus
            defaultValue={track.name}
            onBlur={(e) => {
              renameAudioTrack(track.id, e.currentTarget.value || track.name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                renameAudioTrack(track.id, e.currentTarget.value || track.name);
                setEditing(false);
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            className="flex-1 rounded border border-edge bg-panel px-1 text-ink"
          />
        ) : (
          <span
            onDoubleClick={() => setEditing(true)}
            className="flex-1 truncate text-ink/90"
            title={`${track.file} • ${duration ? duration.toFixed(2) + "s" : "—"}`}
          >
            {track.name}
          </span>
        )}
        <button
          onClick={() => {
            if (confirm(`Delete "${track.name}"?`)) deleteAudioTrack(track.id);
          }}
          className="text-ink/40 hover:text-red-300"
          title="Delete track"
        >
          ×
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={260}
        height={36}
        className="mt-1 block w-full rounded bg-panel"
      />

      <div className="mt-1 grid grid-cols-2 gap-1">
        <label className="flex items-center gap-1" title="Offset (seconds into the timeline)">
          <span className="text-ink/50">off</span>
          <input
            type="number"
            step={0.05}
            value={Number.isFinite(track.offsetSeconds) ? track.offsetSeconds : 0}
            onChange={(e) => setAudioOffset(track.id, parseFloat(e.currentTarget.value) || 0)}
            className="w-full rounded border border-edge bg-panel px-1 py-0.5 font-mono"
          />
        </label>
        <label className="flex items-center gap-1" title="Gain in decibels">
          <span className="text-ink/50">dB</span>
          <input
            type="number"
            step={1}
            value={Number.isFinite(track.gainDb) ? track.gainDb : 0}
            onChange={(e) => setAudioGain(track.id, parseFloat(e.currentTarget.value) || 0)}
            className="w-full rounded border border-edge bg-panel px-1 py-0.5 font-mono"
          />
        </label>
      </div>
    </div>
  );
}
