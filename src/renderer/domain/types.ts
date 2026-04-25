/**
 * Core domain types for Frog Animator.
 *
 * The schema maps directly to the PRD: a Project owns Compositions and an
 * Asset library. A Composition is a tree of Layers (some of which are Groups).
 * Each animatable property holds a list of Keyframes; values between
 * keyframes are interpolated at render time.
 */

export type Id = string;

export type Vec2 = { x: number; y: number };

export type RgbaColor = { r: number; g: number; b: number; a: number };

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/**
 * An imported image asset. The actual pixels live in IndexedDB as a Blob;
 * the in-memory record holds metadata plus a cached object URL for display.
 */
export type ImageAsset = {
  id: Id;
  name: string;
  width: number;
  height: number;
  // Source PSD layer name, when imported from a PSD.
  sourceLayerName?: string;
  // SHA-256 of the underlying blob; used for de-duplication on re-import.
  contentHash: string;
  createdAt: number;
};

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

export type EasingPreset =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'hold';

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------

/**
 * A keyframe is a (time, value) pair plus the easing applied across the
 * segment that *starts* at this keyframe and ends at the next one.
 */
export type Keyframe<V> = {
  id: Id;
  time: number; // seconds
  value: V;
  easing: EasingPreset;
};

export type ScalarTrack = Keyframe<number>[];
export type Vec2Track = Keyframe<Vec2>[];
export type ColorTrack = Keyframe<RgbaColor>[];

// ---------------------------------------------------------------------------
// Layer properties
// ---------------------------------------------------------------------------

/**
 * Animatable transform properties common to all layer kinds (FR-4.1 - 4.4).
 * Children inherit the parent transform.
 */
export type Transform = {
  position: Vec2Track;
  rotation: ScalarTrack; // degrees
  scale: Vec2Track;
  anchor: Vec2Track; // normalized 0..1 within layer bounds
};

/** Visual effects applied to image layers (FR-4.5 - 4.9). */
export type ImageEffects = {
  opacity: ScalarTrack; // 0..1
  tintColor: ColorTrack;
  tintIntensity: ScalarTrack; // 0..1
  blurRadius: ScalarTrack; // pixels

  dropShadow: {
    enabled: boolean;
    offset: Vec2Track;
    blur: ScalarTrack;
    color: ColorTrack;
    opacity: ScalarTrack;
  };

  glow: {
    enabled: boolean;
    radius: ScalarTrack;
    color: ColorTrack;
    intensity: ScalarTrack;
  };
};

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

type LayerCommon = {
  id: Id;
  name: string;
  visible: boolean;
  locked: boolean;
  solo: boolean;
  transform: Transform;
};

export type ImageLayer = LayerCommon & {
  kind: 'image';
  assetId: Id;
  effects: ImageEffects;
};

export type GroupLayer = LayerCommon & {
  kind: 'group';
  children: Layer[];
  // A Group is convertible to a Character Template (FR-6.1).
  templateOriginId?: Id;
};

export type Layer = ImageLayer | GroupLayer;

// ---------------------------------------------------------------------------
// Compositions
// ---------------------------------------------------------------------------

export type Composition = {
  id: Id;
  name: string;
  width: number;
  height: number;
  framerate: number;
  durationSeconds: number;
  backgroundColor: RgbaColor;
  // Top-level layers, rendered back-to-front in array order.
  root: Layer[];
};

// ---------------------------------------------------------------------------
// Character templates
// ---------------------------------------------------------------------------

/**
 * A template is a Group snapshot stored at the project level (and exportable
 * to the cross-project library). Instantiation deep-clones the snapshot, so
 * edits to the instance never affect the master (FR-6.4, copy-on-import).
 */
export type CharacterTemplate = {
  id: Id;
  name: string;
  // Embedded asset records — templates carry their own pixels so they survive
  // being moved between projects.
  assets: ImageAsset[];
  // The serialized Group at the moment of save.
  group: GroupLayer;
  createdAt: number;
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type Project = {
  id: Id;
  name: string;
  createdAt: number;
  updatedAt: number;
  assets: ImageAsset[];
  compositions: Composition[];
  templates: CharacterTemplate[];
  // The composition currently shown in the editor.
  activeCompositionId: Id | null;
};
