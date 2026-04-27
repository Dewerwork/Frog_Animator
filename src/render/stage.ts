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
  onionBefore.alpha = 0.4;
  onionAfter.alpha = 0.4;

  app.stage.addChild(onionBefore, current, onionAfter);

  return {
    app,
    onionBefore,
    current,
    onionAfter,
    destroy: () => app.destroy(true, { children: true, texture: false }),
  };
}
