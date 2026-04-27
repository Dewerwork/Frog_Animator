// Pixi v8 Application bootstrap. Three layered containers: onionBefore,
// current, onionAfter — all wrapped in a `camera` Container that the user
// can pan and zoom independently of the project canvas.

import { Application, Container, Graphics } from "pixi.js";

export interface StageHandles {
  app: Application;
  /** Camera transform parent — pan/zoom is applied here. */
  camera: Container;
  onionBefore: Container;
  current: Container;
  onionAfter: Container;
  /** Border drawn at canvas bounds inside the camera so it tracks pan/zoom. */
  canvasBorder: Graphics;
  /** Logical canvas size (separate from the on-screen canvas element size). */
  canvasWidth: number;
  canvasHeight: number;
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

  const camera = new Container();
  camera.label = "camera";
  app.stage.addChild(camera);

  const onionBefore = new Container();
  const current = new Container();
  const onionAfter = new Container();
  onionBefore.label = "onion-before";
  current.label = "current";
  onionAfter.label = "onion-after";

  // Canvas-bounds outline rendered inside the camera so it pans/zooms with
  // the scene. Helpful when the user has scrolled the camera off-axis.
  const canvasBorder = new Graphics();
  canvasBorder.label = "canvas-border";
  canvasBorder.eventMode = "none";
  canvasBorder.zIndex = -10000;
  drawCanvasBorder(canvasBorder, width, height);

  camera.addChild(canvasBorder, onionBefore, current, onionAfter);

  return {
    app,
    camera,
    onionBefore,
    current,
    onionAfter,
    canvasBorder,
    canvasWidth: width,
    canvasHeight: height,
    destroy: () => app.destroy(true, { children: true, texture: false }),
  };
}

function drawCanvasBorder(g: Graphics, w: number, h: number): void {
  g.clear();
  // Slightly inset so the 1-px line sits inside the canvas rect.
  g.rect(0.5, 0.5, w - 1, h - 1).stroke({ color: 0x33333d, width: 1, alpha: 0.85 });
}
