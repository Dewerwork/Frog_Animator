// Playback driver: drives currentFrameIndex at project fps when `playing`.
//
// Uses performance.now() for timing — M6 will switch to AudioContext when
// audio tracks are present (see plan §10 on drift).

import { useEffect } from "react";

import { useStore } from "@/state/store";
import { frameCount } from "@/state/selectors";

export function usePlaybackLoop(): void {
  useEffect(() => {
    let raf = 0;
    let lastStart = -1;
    let frameAtStart = 0;

    const tick = (now: number) => {
      const s = useStore.getState();
      if (!s.playing || !s.project) {
        lastStart = -1;
        raf = requestAnimationFrame(tick);
        return;
      }
      if (lastStart < 0) {
        lastStart = now;
        frameAtStart = s.currentFrameIndex;
      }
      const fps = s.project.settings.fps;
      const total = frameCount(s.project);
      const elapsed = (now - lastStart) / 1000;
      const target = Math.floor(frameAtStart + elapsed * fps);

      if (total > 0) {
        const wrapped = target % total;
        if (wrapped !== s.currentFrameIndex) s.setFrameIndex(wrapped);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
