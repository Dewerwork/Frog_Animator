import type { EasingPreset } from './types';

/**
 * Maps an easing preset to a normalized progress curve. `t` is the linear
 * progress through a keyframe segment (0..1); the return value is the eased
 * progress used for value interpolation.
 *
 * `hold` is a step function — the segment outputs the start value until the
 * very end of the segment.
 */
export function applyEasing(preset: EasingPreset, t: number): number {
  switch (preset) {
    case 'linear':
      return t;
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'hold':
      return t < 1 ? 0 : 1;
  }
}
