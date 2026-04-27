// Waveform generation for the timeline strip. Implementation in M6.

export interface WaveformPeaks {
  /** Peaks per second of audio, normalized to [0, 1]. */
  peaks: Float32Array;
  sampleRate: number;
}

export function computePeaks(_buf: AudioBuffer, _peaksPerSecond: number): WaveformPeaks {
  throw new Error("audio/waveform: not implemented (M6)");
}
