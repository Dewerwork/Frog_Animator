// Builds a Pixi scene graph from a resolved pose. One Container per
// Character, one Sprite per visible Layer, anchor = pivot/textureSize.

import { Container } from "pixi.js";

import type { Project } from "@/model/types";
import type { ResolvedPose } from "./resolve";

export interface ComposeContext {
  pose: ResolvedPose;
  project: Project;
}

/** Stub — real implementation lands with the Pixi stage in M1+. */
export function composeInto(_root: Container, _ctx: ComposeContext): void {
  // TODO: walk characters, create/update Sprites, sort by z, apply parent transforms.
}
