// Core data model. Frames hold sparse deltas — absence means "hold the
// previously resolved value." See plan §3.

export type Id = string;

export interface Vec2 {
  x: number;
  y: number;
}

export interface AssetRef {
  /** Stable id pointing at <projectRoot>/assets/<assetId>/<file>. */
  assetId: Id;
  /** Filename within the asset directory. */
  file: string;
}

export interface WardrobeVariant {
  id: Id;
  name: string;
  asset: AssetRef;
  /** Override the layer pivot when this variant is active. */
  pivotOverride?: Vec2;
}

export interface LayerRest {
  translation: Vec2;
  rotation: number;
  scale: Vec2;
  visible: boolean;
  defaultVariantId: Id;
  defaultZ: number;
}

/** Optional joint constraints — clamped both during drag and inside the
 *  resolver after each frame's deltas are applied. All bounds are in
 *  parent-local space (rotation in radians). Any axis can be omitted. */
export interface LayerConstraints {
  rotation?: { min: number; max: number };
  translation?: { min: Vec2; max: Vec2 };
  scale?: { min: Vec2; max: Vec2 };
}

export interface Layer {
  id: Id;
  name: string;
  parent: Id | null;
  /** Image-local pivot, in the variant texture's pixel space. */
  pivot: Vec2;
  rest: LayerRest;
  wardrobe: WardrobeVariant[];
  constraints?: LayerConstraints;
}

export interface Character {
  id: Id;
  name: string;
  layers: Layer[];
  rootTransform: {
    translation: Vec2;
    rotation: number;
    scale: Vec2;
  };
}

/** Sparse delta: absent fields fall back to the prior resolved value. */
export interface FrameLayerState {
  translation?: Vec2;
  rotation?: number;
  scale?: Vec2;
  visible?: boolean;
  variantId?: Id;
  z?: number;
}

export interface Frame {
  id: Id;
  /** Keyed by Layer.id, "<characterId>:root", or "bg:<bgId>". */
  layers: Record<Id, FrameLayerState>;
}

export interface AudioTrack {
  id: Id;
  name: string;
  file: string;
  offsetSeconds: number;
  gainDb: number;
  muted: boolean;
}

export interface Background {
  id: Id;
  name: string;
  variants: WardrobeVariant[];
}

export interface Scene {
  canvas: { width: number; height: number };
  characters: Character[];
  background: Background | null;
  frames: Frame[];
  audio: AudioTrack[];
}

export interface ProjectSettings {
  fps: number;
  onionSkin: {
    enabled: boolean;
    before: number;
    after: number;
    tintBefore: number;
    tintAfter: number;
  };
}

export interface Project {
  schemaVersion: 1;
  settings: ProjectSettings;
  scene: Scene;
}

/** Composite key for a per-frame override targeting a specific entity. */
export type TargetId =
  | Id // Layer.id
  | `${Id}:root` // character root transform
  | `bg:${Id}`; // background variant
