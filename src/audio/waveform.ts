// Waveform peaks for the timeline strip. Mixes channels to mono and stores
// (min, max) pairs per peak bucket — that's what scrollable waveforms need
// to draw correctly at low zoom levels.

export interface WaveformPeaks {
  /** Flat array of (min, max) pairs, length = bucketCount * 2. */
  peaks: Float32Array;
  /** Buckets per second of audio (resolution). */
  peaksPerSecond: number;
  duration: number;
  sampleRate: number;
}

export function computePeaks(buf: AudioBuffer, peaksPerSecond: number): WaveformPeaks {
  const bucketCount = Math.max(1, Math.ceil(buf.duration * peaksPerSecond));
  const samplesPerBucket = Math.max(1, Math.floor(buf.length / bucketCount));
  const peaks = new Float32Array(bucketCount * 2);

  const channelCount = buf.numberOfChannels;
  // Pull each channel's underlying Float32Array once — getChannelData copies
  // data on some browsers when called inside a hot loop.
  const channels: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) channels.push(buf.getChannelData(c));

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = bucket * samplesPerBucket;
    const end = Math.min(start + samplesPerBucket, buf.length);
    let min = 0;
    let max = 0;
    for (let s = start; s < end; s++) {
      let sample = 0;
      for (let c = 0; c < channelCount; c++) sample += channels[c]![s] ?? 0;
      sample /= channelCount;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    peaks[bucket * 2] = min;
    peaks[bucket * 2 + 1] = max;
  }

  return {
    peaks,
    peaksPerSecond,
    duration: buf.duration,
    sampleRate: buf.sampleRate,
  };
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: WaveformPeaks,
  options: { color?: string; bg?: string } = {},
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.fillStyle = options.bg ?? "#23232b";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = options.color ?? "#5cc8a6";
  ctx.lineWidth = 1;
  ctx.beginPath();

  const bucketCount = peaks.peaks.length / 2;
  const colsPerBucket = width / bucketCount;
  const mid = height / 2;
  const amp = (height / 2) * 0.95;

  for (let i = 0; i < bucketCount; i++) {
    const min = peaks.peaks[i * 2]!;
    const max = peaks.peaks[i * 2 + 1]!;
    const x = i * colsPerBucket;
    ctx.moveTo(x, mid - max * amp);
    ctx.lineTo(x, mid - min * amp);
  }
  ctx.stroke();
}
