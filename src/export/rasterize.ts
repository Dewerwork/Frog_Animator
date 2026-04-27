// Headless Pixi rasterizer. Spins up an offscreen Application sized to the
// project canvas, walks frames, composes the resolved pose, renders, and
// returns PNG bytes via canvas.toBlob.

import { Application, Container } from "pixi.js";

import type { Project } from "@/model/types";
import { composeInto, createComposeState, type ComposeState } from "@/rig/compose";
import { resolvePose } from "@/rig/resolve";

export interface Rasterizer {
  app: Application;
  state: ComposeState;
  stage: Container;
  destroy(): void;
}

/** Background color used for rendering frames. yuv420p video has no alpha;
 *  whatever is transparent in the stage is composited against this. */
const EXPORT_BG = 0x000000;

export async function createRasterizer(width: number, height: number): Promise<Rasterizer> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const app = new Application();
  await app.init({
    canvas,
    width,
    height,
    background: EXPORT_BG,
    antialias: true,
    autoDensity: false,
    resolution: 1,
  });
  const stage = new Container();
  app.stage.addChild(stage);
  return {
    app,
    state: createComposeState(),
    stage,
    destroy: () => app.destroy(true, { children: true, texture: false }),
  };
}

export async function rasterizeFrame(
  rast: Rasterizer,
  project: Project,
  frameIndex: number,
): Promise<Uint8Array> {
  const pose = resolvePose(project, frameIndex);
  composeInto(rast.stage, project, pose, rast.state);
  rast.app.render();

  const canvas = rast.app.canvas as HTMLCanvasElement;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("toBlob returned null");
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}
