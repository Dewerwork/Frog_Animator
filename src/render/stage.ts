// Pixi v8 Application bootstrap. Three layered containers: onionBefore,
// current, onionAfter. The host React component owns the canvas element;
// this module owns the Pixi state.

import { Application, Container } from "pixi.js";

export interface StageHandles {
  app: Application;
  onionBefore: Container;
  current: Container;
  onionAfter: Container;
  destroy(): void;
}

export async function createStage(canvas: HTMLCanvasElement, width: number, height: number): Promise<StageHandles> {
  const app = new Application();
  await app.init({
    canvas,
    width,
    height,
    background: 0x1a1a1f,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  const onionBefore = new Container();
  const current = new Container();
  const onionAfter = new Container();
  // Per-sprite alpha is set during compose; container alpha stays at 1 so the
  // toggle can fully hide ghosts by setting visible = false.
  onionBefore.label = "onion-before";
  current.label = "current";
  onionAfter.label = "onion-after";

  app.stage.addChild(onionBefore, current, onionAfter);

  return {
    app,
    onionBefore,
    current,
    onionAfter,
    destroy: () => app.destroy(true, { children: true, texture: false }),
  };
}
