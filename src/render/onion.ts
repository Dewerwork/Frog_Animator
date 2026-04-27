// Onion skinning: re-resolve N prior/next frames, tint + decaying alpha.
// Disabled while scrubbing for perf (see plan §5).

export interface OnionConfig {
  before: number;
  after: number;
  tintBefore: number;
  tintAfter: number;
}

/** Stub — wired with composeInto in M4. */
export function buildOnionLayers(_cfg: OnionConfig): void {
  // TODO(M4)
}
