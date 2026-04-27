// Drag math + constraint clamping shared between Stage drag handlers and the
// resolver. Centralized so live-clamp during drag matches the post-resolve
// clamp byte-for-byte.

import type { FrameLayerState, LayerConstraints, Vec2 } from "@/model/types";

function clampScalar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Clamp a translation Vec2 against a {min, max} bbox in parent-local space. */
export function clampTranslation(
  t: Vec2,
  bounds: { min: Vec2; max: Vec2 } | undefined,
): Vec2 {
  if (!bounds) return t;
  return {
    x: clampScalar(t.x, bounds.min.x, bounds.max.x),
    y: clampScalar(t.y, bounds.min.y, bounds.max.y),
  };
}

export function clampScale(
  s: Vec2,
  bounds: { min: Vec2; max: Vec2 } | undefined,
): Vec2 {
  if (!bounds) return s;
  return {
    x: clampScalar(s.x, bounds.min.x, bounds.max.x),
    y: clampScalar(s.y, bounds.min.y, bounds.max.y),
  };
}

export function clampRotation(
  r: number,
  bounds: { min: number; max: number } | undefined,
): number {
  if (!bounds) return r;
  return clampScalar(r, bounds.min, bounds.max);
}

/** Apply all three constraint axes to a pose, returning a new clamped object.
 *  Cheap and pure; safe to call from the resolver hot loop. */
export function clampPose(
  pose: Required<FrameLayerState>,
  c: LayerConstraints | undefined,
): Required<FrameLayerState> {
  if (!c) return pose;
  return {
    ...pose,
    translation: clampTranslation(pose.translation, c.translation),
    rotation: clampRotation(pose.rotation, c.rotation),
    scale: clampScale(pose.scale, c.scale),
  };
}

/** Compute the angle (radians, atan2) from a pivot point to a cursor point.
 *  Both in the same coordinate frame (parent-local). */
export function angleFromPivot(pivot: Vec2, cursor: Vec2): number {
  return Math.atan2(cursor.y - pivot.y, cursor.x - pivot.x);
}

/** Wrap a rotation delta into (-π, π] so the user gets the shortest-arc
 *  rotation, never an unintentional 2π flip. */
export function shortestArc(deltaRadians: number): number {
  let d = deltaRadians;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
