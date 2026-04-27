// Playback transport. Stores (audioStartTime, frameAtStart) and recomputes
// on every play to avoid drift on pause/resume (see plan §10).

export interface TransportState {
  audioStartTime: number;
  frameAtStart: number;
  fps: number;
}

export function frameAt(now: number, state: TransportState): number {
  return state.frameAtStart + (now - state.audioStartTime) * state.fps;
}
