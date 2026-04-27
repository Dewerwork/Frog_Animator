// AudioContext singleton. Lazy-initialized on first access; auto-resumed
// after user gesture (every panel that triggers audio nudges this).

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor: typeof AudioContext =
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
      window.AudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function maybeAudioContext(): AudioContext | null {
  return ctx;
}
