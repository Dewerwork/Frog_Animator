// Pose resolver. Backward scan over frames [0..i], folding sparse deltas
// onto Layer.rest / Character.rootTransform / Background defaults.
//
// Cached per frameIndex by content hash — load-bearing for onion skin perf.
// (Cache wired in M4 once we have a stable hash; resolver itself is pure now.)

import type {
  Character,
  Frame,
  FrameLayerState,
  Layer,
  Project,
  TargetId,
} from "@/model/types";

export type ResolvedPose = Record<TargetId, Required<FrameLayerState>>;

function applyDelta(
  base: Required<FrameLayerState>,
  delta: FrameLayerState,
): Required<FrameLayerState> {
  return {
    translation: delta.translation ?? base.translation,
    rotation: delta.rotation ?? base.rotation,
    scale: delta.scale ?? base.scale,
    visible: delta.visible ?? base.visible,
    variantId: delta.variantId ?? base.variantId,
    z: delta.z ?? base.z,
  };
}

function layerDefaults(layer: Layer): Required<FrameLayerState> {
  return {
    translation: layer.rest.translation,
    rotation: layer.rest.rotation,
    scale: layer.rest.scale,
    visible: layer.rest.visible,
    variantId: layer.rest.defaultVariantId,
    z: layer.rest.defaultZ,
  };
}

function rootDefaults(character: Character): Required<FrameLayerState> {
  return {
    translation: character.rootTransform.translation,
    rotation: character.rootTransform.rotation,
    scale: character.rootTransform.scale,
    visible: true,
    variantId: "",
    z: 0,
  };
}

export function resolvePose(project: Project, frameIndex: number): ResolvedPose {
  const pose: ResolvedPose = {};

  for (const c of project.scene.characters) {
    pose[`${c.id}:root` as TargetId] = rootDefaults(c);
    for (const l of c.layers) pose[l.id as TargetId] = layerDefaults(l);
  }
  if (project.scene.background) {
    const bg = project.scene.background;
    pose[`bg:${bg.id}` as TargetId] = {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      visible: true,
      variantId: bg.variants[0]?.id ?? "",
      z: -1000,
    };
  }

  const frames = project.scene.frames;
  const upTo = Math.min(frameIndex, frames.length - 1);
  for (let i = 0; i <= upTo; i++) {
    const f: Frame = frames[i];
    for (const [target, delta] of Object.entries(f.layers)) {
      const t = target as TargetId;
      const prev = pose[t];
      if (!prev) continue; // dangling reference — ignored, invariant check is M5.
      pose[t] = applyDelta(prev, delta);
    }
  }
  return pose;
}
