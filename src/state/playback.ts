// Playback driver: drives currentFrameIndex at project fps when `playing`.
//
// Anchors timing to the AudioContext when there are decoded audio tracks
// (avoids drift on pause/resume — see plan §10) and falls back to
// performance.now() otherwise.

import { useEffect } from "react";

import { audioRuntime } from "@/audio/runtime";
import { getAudioContext, maybeAudioContext } from "@/audio/context";
import { useStore } from "@/state/store";
import { frameCount } from "@/state/selectors";

export function usePlaybackLoop(): void {
  useEffect(() => {
    let raf = 0;
    let lastWasPlaying = false;
    /** Timestamp (in seconds, in whichever clock domain we're using) marking
     *  when the current playback run started. -1 means "not in a run." */
    let runStart = -1;
    let runFrameAtStart = 0;
    let useAudioClock = false;

    const tick = (now: number) => {
      const s = useStore.getState();
      if (!s.playing || !s.project) {
        if (lastWasPlaying) {
          // Falling edge — stop any in-flight audio sources.
          audioRuntime.stopAll();
          lastWasPlaying = false;
          runStart = -1;
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      const fps = s.project.settings.fps;
      const total = frameCount(s.project);
      if (total <= 0) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // Rising edge — initialize the run.
      if (!lastWasPlaying || runStart < 0) {
        const tracks = s.project.scene.audio;
        const hasDecodedTracks = tracks.some((t) => audioRuntime.hasTrack(t.id));
        useAudioClock = hasDecodedTracks;

        runFrameAtStart = s.currentFrameIndex;
        const timelineStartSec = runFrameAtStart / fps;

        if (useAudioClock) {
          const startAt = audioRuntime.startPlayback(tracks, timelineStartSec);
          runStart = startAt;
        } else {
          runStart = now / 1000;
        }
        lastWasPlaying = true;
      }

      const clockNow = useAudioClock
        ? (maybeAudioContext()?.currentTime ?? getAudioContext().currentTime)
        : now / 1000;
      const elapsed = clockNow - runStart;
      const target = runFrameAtStart + elapsed * fps;
      const wrapped = ((Math.floor(target) % total) + total) % total;

      if (wrapped !== s.currentFrameIndex) s.setFrameIndex(wrapped);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      audioRuntime.stopAll();
    };
  }, []);
}
