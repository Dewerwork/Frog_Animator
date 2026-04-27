// Audio runtime: a process-wide registry of decoded buffers + active
// playback nodes. Independent from the project store — buffers are derived
// state we rebuild from disk on project load.

import type { AudioTrack } from "@/model/types";
import { getAudioContext } from "./context";
import type { WaveformPeaks } from "./waveform";

interface RuntimeTrack {
  buffer: AudioBuffer;
  peaks: WaveformPeaks;
}

class AudioRuntime {
  private tracks = new Map<string, RuntimeTrack>();
  private active = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();

  setTrack(trackId: string, buffer: AudioBuffer, peaks: WaveformPeaks): void {
    this.tracks.set(trackId, { buffer, peaks });
  }
  hasTrack(trackId: string): boolean {
    return this.tracks.has(trackId);
  }
  getPeaks(trackId: string): WaveformPeaks | null {
    return this.tracks.get(trackId)?.peaks ?? null;
  }
  getDuration(trackId: string): number {
    return this.tracks.get(trackId)?.buffer.duration ?? 0;
  }
  removeTrack(trackId: string): void {
    this.tracks.delete(trackId);
  }
  clear(): void {
    this.stopAll();
    this.tracks.clear();
  }

  /** Schedule playback for every unmuted track. `timelineStartSec` is the
   *  position within the timeline (in seconds) at which playback starts —
   *  drives where each track jumps in. Returns the audio-context time used
   *  as the start anchor. */
  startPlayback(tracks: AudioTrack[], timelineStartSec: number): number {
    this.stopAll();
    const ctx = getAudioContext();
    const startAt = ctx.currentTime + 0.05; // small offset to avoid latency glitches

    for (const t of tracks) {
      if (t.muted) continue;
      const rt = this.tracks.get(t.id);
      if (!rt) continue;

      const trackTimelineStart = t.offsetSeconds;
      const trackTimelineEnd = trackTimelineStart + rt.buffer.duration;
      if (timelineStartSec >= trackTimelineEnd) continue; // already past

      const source = ctx.createBufferSource();
      source.buffer = rt.buffer;
      const gain = ctx.createGain();
      gain.gain.value = dbToLinear(t.gainDb);
      source.connect(gain).connect(ctx.destination);

      let when: number;
      let offsetIntoBuffer: number;
      if (timelineStartSec < trackTimelineStart) {
        // Track plays after a delay. Start from buffer pos 0.
        when = startAt + (trackTimelineStart - timelineStartSec);
        offsetIntoBuffer = 0;
      } else {
        // Mid-track: start now from the right buffer offset.
        when = startAt;
        offsetIntoBuffer = timelineStartSec - trackTimelineStart;
      }
      source.start(when, offsetIntoBuffer);
      this.active.set(t.id, { source, gain });
    }
    return startAt;
  }

  stopAll(): void {
    for (const { source, gain } of this.active.values()) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
      gain.disconnect();
    }
    this.active.clear();
  }
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export const audioRuntime = new AudioRuntime();
