// Imperative camera controls. Stage registers handlers on mount; Transport
// (and any future toolbar) calls these to pan/zoom/center the view. Camera
// state itself lives on the Pixi `camera` Container, not in the store —
// it's view state, not project state, so it shouldn't trigger autosave or
// land in the undo stack.

type Handlers = {
  center: () => void;
  zoomBy: (factor: number) => void;
};

let active: Handlers | null = null;

export function registerCameraControls(h: Handlers): () => void {
  active = h;
  return () => {
    if (active === h) active = null;
  };
}

export function centerCamera(): void {
  active?.center();
}

export function zoomCamera(factor: number): void {
  active?.zoomBy(factor);
}
