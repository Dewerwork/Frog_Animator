import { v4 as uuid } from 'uuid';
import type {
  Composition,
  GroupLayer,
  ImageEffects,
  ImageLayer,
  Project,
  RgbaColor,
  Transform,
} from './types';

const ZERO_COLOR: RgbaColor = { r: 0, g: 0, b: 0, a: 0 };
const WHITE: RgbaColor = { r: 1, g: 1, b: 1, a: 1 };

export function defaultTransform(): Transform {
  return {
    position: [],
    rotation: [],
    scale: [],
    anchor: [],
  };
}

export function defaultEffects(): ImageEffects {
  return {
    opacity: [],
    tintColor: [],
    tintIntensity: [],
    blurRadius: [],
    dropShadow: {
      enabled: false,
      offset: [],
      blur: [],
      color: [],
      opacity: [],
    },
    glow: {
      enabled: false,
      radius: [],
      color: [],
      intensity: [],
    },
  };
}

export function createImageLayer(name: string, assetId: string): ImageLayer {
  return {
    id: uuid(),
    kind: 'image',
    name,
    assetId,
    visible: true,
    locked: false,
    solo: false,
    transform: defaultTransform(),
    effects: defaultEffects(),
  };
}

export function createGroup(name: string): GroupLayer {
  return {
    id: uuid(),
    kind: 'group',
    name,
    visible: true,
    locked: false,
    solo: false,
    transform: defaultTransform(),
    children: [],
  };
}

export type CompositionPreset = {
  width: number;
  height: number;
  framerate: number;
  durationSeconds: number;
};

// Standard presets from FR-2.2.
export const COMPOSITION_PRESETS = {
  hd30: { width: 1920, height: 1080, framerate: 30, durationSeconds: 30 },
  hd60: { width: 1920, height: 1080, framerate: 60, durationSeconds: 30 },
  uhd30: { width: 3840, height: 2160, framerate: 30, durationSeconds: 30 },
} as const satisfies Record<string, CompositionPreset>;

export function createComposition(
  name: string,
  preset: CompositionPreset = COMPOSITION_PRESETS.hd30,
): Composition {
  return {
    id: uuid(),
    name,
    width: preset.width,
    height: preset.height,
    framerate: preset.framerate,
    durationSeconds: preset.durationSeconds,
    backgroundColor: ZERO_COLOR,
    root: [],
  };
}

export function createProject(name: string): Project {
  const comp = createComposition('Main');
  const now = Date.now();
  return {
    id: uuid(),
    name,
    createdAt: now,
    updatedAt: now,
    assets: [],
    compositions: [comp],
    templates: [],
    activeCompositionId: comp.id,
  };
}

export const DEFAULT_TINT: RgbaColor = WHITE;
