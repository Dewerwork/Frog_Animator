import { applyEasing } from './easing';
import type { Keyframe, RgbaColor, Vec2 } from './types';

/**
 * Returns the active value of a track at time `t` (seconds). Uses the easing
 * preset stored on the keyframe that *starts* the surrounding segment.
 *
 * Empty tracks are not allowed at the call site; provide a `defaultValue`
 * fallback only for safety.
 */
export function sampleScalar(
  track: Keyframe<number>[],
  t: number,
  defaultValue: number,
): number {
  if (track.length === 0) return defaultValue;
  if (t <= track[0]!.time) return track[0]!.value;
  if (t >= track[track.length - 1]!.time) return track[track.length - 1]!.value;

  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]!;
    const b = track[i + 1]!;
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const linear = span === 0 ? 1 : (t - a.time) / span;
      const eased = applyEasing(a.easing, linear);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return defaultValue;
}

export function sampleVec2(
  track: Keyframe<Vec2>[],
  t: number,
  defaultValue: Vec2,
): Vec2 {
  if (track.length === 0) return defaultValue;
  if (t <= track[0]!.time) return track[0]!.value;
  if (t >= track[track.length - 1]!.time) return track[track.length - 1]!.value;

  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]!;
    const b = track[i + 1]!;
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const linear = span === 0 ? 1 : (t - a.time) / span;
      const eased = applyEasing(a.easing, linear);
      return {
        x: a.value.x + (b.value.x - a.value.x) * eased,
        y: a.value.y + (b.value.y - a.value.y) * eased,
      };
    }
  }
  return defaultValue;
}

export function sampleColor(
  track: Keyframe<RgbaColor>[],
  t: number,
  defaultValue: RgbaColor,
): RgbaColor {
  if (track.length === 0) return defaultValue;
  if (t <= track[0]!.time) return track[0]!.value;
  if (t >= track[track.length - 1]!.time) return track[track.length - 1]!.value;

  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]!;
    const b = track[i + 1]!;
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const linear = span === 0 ? 1 : (t - a.time) / span;
      const eased = applyEasing(a.easing, linear);
      return {
        r: a.value.r + (b.value.r - a.value.r) * eased,
        g: a.value.g + (b.value.g - a.value.g) * eased,
        b: a.value.b + (b.value.b - a.value.b) * eased,
        a: a.value.a + (b.value.a - a.value.a) * eased,
      };
    }
  }
  return defaultValue;
}
