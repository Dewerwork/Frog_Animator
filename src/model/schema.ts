import { z } from "zod";

const Vec2 = z.object({ x: z.number(), y: z.number() });

const AssetRef = z.object({
  assetId: z.string(),
  file: z.string(),
});

const WardrobeVariant = z.object({
  id: z.string(),
  name: z.string(),
  asset: AssetRef,
  pivotOverride: Vec2.optional(),
});

const LayerRest = z.object({
  translation: Vec2,
  rotation: z.number(),
  scale: Vec2,
  visible: z.boolean(),
  defaultVariantId: z.string(),
  defaultZ: z.number(),
});

const Layer = z.object({
  id: z.string(),
  name: z.string(),
  parent: z.string().nullable(),
  pivot: Vec2,
  rest: LayerRest,
  wardrobe: z.array(WardrobeVariant),
});

const Character = z.object({
  id: z.string(),
  name: z.string(),
  layers: z.array(Layer),
  rootTransform: z.object({
    translation: Vec2,
    rotation: z.number(),
    scale: Vec2,
  }),
});

const FrameLayerState = z
  .object({
    translation: Vec2,
    rotation: z.number(),
    scale: Vec2,
    visible: z.boolean(),
    variantId: z.string(),
    z: z.number(),
  })
  .partial();

const Frame = z.object({
  id: z.string(),
  layers: z.record(z.string(), FrameLayerState),
});

const AudioTrack = z.object({
  id: z.string(),
  name: z.string(),
  file: z.string(),
  offsetSeconds: z.number(),
  gainDb: z.number(),
  muted: z.boolean(),
});

const Background = z.object({
  id: z.string(),
  name: z.string(),
  variants: z.array(WardrobeVariant),
});

const Scene = z.object({
  canvas: z.object({ width: z.number(), height: z.number() }),
  characters: z.array(Character),
  background: Background.nullable(),
  frames: z.array(Frame),
  audio: z.array(AudioTrack),
});

const ProjectSettings = z.object({
  fps: z.number().int().positive(),
  onionSkin: z.object({
    enabled: z.boolean(),
    before: z.number().int().nonnegative(),
    after: z.number().int().nonnegative(),
    tintBefore: z.number(),
    tintAfter: z.number(),
  }),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  settings: ProjectSettings,
  scene: Scene,
});

export type ProjectParsed = z.infer<typeof ProjectSchema>;
