// Single Zustand store. Mutations go through Immer for structural sharing
// and so the history layer can record patches.

import { create } from "zustand";
import { produce } from "immer";
import { ulid } from "ulid";

import type {
  Character,
  Frame,
  Layer,
  Project,
  TargetId,
  FrameLayerState,
  Vec2,
} from "@/model/types";
import { resolvePose } from "@/rig/resolve";
import { allTargetIds } from "@/state/selectors";

export interface EditingBuffer {
  // Pending edits for the current frame, keyed by TargetId. Cleared on capture
  // or explicit revert.
  edits: Record<TargetId, FrameLayerState>;
}

export type EditorMode = "animate" | "rig";

export interface AppState {
  project: Project | null;
  projectPath: string | null;
  /** Absolute path to <projectRoot>/ — parent of project.json. */
  projectRoot: string | null;
  /** Bumped on any project mutation; reset by markSaved(). Drives autosave. */
  dirtyTick: number;
  lastSavedTick: number;

  currentFrameIndex: number;
  selection: TargetId[];
  mode: EditorMode;
  playing: boolean;

  editing: EditingBuffer;

  setProject: (project: Project, path: string | null, root?: string | null) => void;
  setProjectPath: (path: string | null) => void;
  markSaved: () => void;
  setMode: (mode: EditorMode) => void;
  setSelection: (sel: TargetId[]) => void;
  setFrameIndex: (i: number) => void;
  togglePlay: () => void;

  /** Add a wardrobe variant to a layer, optionally selecting it. */
  addWardrobeVariant: (
    layerId: string,
    variant: { id: string; name: string; assetId: string; file: string },
    select?: boolean,
  ) => void;
  /** Rename a wardrobe variant. */
  renameWardrobeVariant: (layerId: string, variantId: string, name: string) => void;
  /** Delete a wardrobe variant; refuses to delete the layer's last variant. */
  deleteWardrobeVariant: (layerId: string, variantId: string) => boolean;
  /** Set the layer's rest defaultVariantId (rig mode). */
  setLayerDefaultVariant: (layerId: string, variantId: string) => void;

  /** Insert a new layer under `parent` (null = top-level). Returns the new id. */
  addLayer: (characterId: string, parent: string | null, name?: string) => string | null;
  deleteLayer: (layerId: string) => void;
  /** Move `layerId` under `newParent` (null = top-level). Rejects cycles. */
  reparentLayer: (layerId: string, newParent: string | null) => boolean;
  /** Mutate the layer's rest pose (rig mode). */
  setLayerRestTranslation: (layerId: string, translation: Vec2) => void;
  setLayerRestRotation: (layerId: string, rotation: number) => void;
  /** Move pivot in image-local pixels and compensate rest.translation so the
   *  sprite stays put visually. */
  setLayerPivot: (layerId: string, pivot: Vec2, translationCompensation?: Vec2) => void;
  renameLayer: (layerId: string, name: string) => void;

  /** Stage a sparse delta into the editing buffer. */
  stageEdit: (target: TargetId, patch: FrameLayerState) => void;
  clearEdits: () => void;

  /** Commit edits → new Frame inserted after currentFrameIndex. */
  captureFrame: (mode: "all" | "selected") => void;
  /** Insert an empty frame after currentFrameIndex (== "hold previous"). */
  insertBlank: () => void;

  /** Update onion-skin settings. */
  setOnionSkin: (patch: Partial<{
    enabled: boolean;
    before: number;
    after: number;
    tintBefore: number;
    tintAfter: number;
  }>) => void;
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    }
    return true;
  }
  return false;
}

/** Strip fields from `next` that are equal to `base` — produces a sparse delta. */
function diffFields(
  base: Required<FrameLayerState>,
  next: Required<FrameLayerState>,
): FrameLayerState {
  const out: FrameLayerState = {};
  if (!eq(next.translation, base.translation)) out.translation = next.translation;
  if (!eq(next.rotation, base.rotation)) out.rotation = next.rotation;
  if (!eq(next.scale, base.scale)) out.scale = next.scale;
  if (!eq(next.visible, base.visible)) out.visible = next.visible;
  if (!eq(next.variantId, base.variantId)) out.variantId = next.variantId;
  if (!eq(next.z, base.z)) out.z = next.z;
  return out;
}

function applyEdit(
  base: Required<FrameLayerState>,
  edit: FrameLayerState | undefined,
): Required<FrameLayerState> {
  if (!edit) return base;
  return {
    translation: edit.translation ?? base.translation,
    rotation: edit.rotation ?? base.rotation,
    scale: edit.scale ?? base.scale,
    visible: edit.visible ?? base.visible,
    variantId: edit.variantId ?? base.variantId,
    z: edit.z ?? base.z,
  };
}

/** Built-in asset id reserved for procedural placeholder textures. */
export const BUILTIN_FROG_ASSET = "builtin:frog";

function defaultFrog(): Character {
  const charId = "char-frog";
  const bodyId = "layer-frog-body";
  const eyeId = "layer-frog-eye";
  const bodyVariant = "variant-frog-body";
  const eyeVariant = "variant-frog-eye";
  return {
    id: charId,
    name: "Frog",
    rootTransform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    layers: [
      {
        id: bodyId,
        name: "Body",
        parent: null,
        // Pivot at image center — texture is 256x256 procedurally.
        pivot: { x: 128, y: 128 },
        rest: {
          translation: { x: 640, y: 360 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          visible: true,
          defaultVariantId: bodyVariant,
          defaultZ: 0,
        },
        wardrobe: [
          {
            id: bodyVariant,
            name: "Default",
            asset: { assetId: "builtin:frog", file: "frog.png" },
          },
        ],
      },
      // Demonstration child: a small "eye highlight" parented to Body. Its
      // rest.translation is in BODY-LOCAL space (offset from body's anchor).
      {
        id: eyeId,
        name: "Eye Highlight",
        parent: bodyId,
        pivot: { x: 32, y: 32 },
        rest: {
          translation: { x: -33, y: -38 },
          rotation: 0,
          scale: { x: 0.35, y: 0.35 },
          visible: true,
          defaultVariantId: eyeVariant,
          defaultZ: 1,
        },
        wardrobe: [
          {
            id: eyeVariant,
            name: "Default",
            asset: { assetId: "builtin:eye", file: "eye.png" },
          },
        ],
      },
    ],
  };
}

export const initialProject = (): Project => ({
  schemaVersion: 1,
  settings: {
    fps: 12,
    onionSkin: {
      enabled: false,
      before: 1,
      after: 1,
      tintBefore: 0xff5577,
      tintAfter: 0x5577ff,
    },
  },
  scene: {
    canvas: { width: 1280, height: 720 },
    characters: [defaultFrog()],
    background: null,
    frames: [{ id: ulid(), layers: {} }],
    audio: [],
  },
});

/** Wraps an Immer recipe so it bumps dirtyTick on any structural mutation. */
function dirty(
  recipe: (s: AppState) => void,
): (s: AppState) => void {
  return (s) => {
    recipe(s);
    s.dirtyTick += 1;
  };
}

function forEachLayer(s: AppState, layerId: string, fn: (l: Layer) => void): void {
  if (!s.project) return;
  for (const c of s.project.scene.characters) {
    const layer = c.layers.find((l) => l.id === layerId);
    if (layer) {
      fn(layer);
      return;
    }
  }
}

export const useStore = create<AppState>((set) => ({
  project: initialProject(),
  projectPath: null,
  projectRoot: null,
  dirtyTick: 0,
  lastSavedTick: 0,
  currentFrameIndex: 0,
  selection: [],
  mode: "animate",
  playing: false,
  editing: { edits: {} },

  setProject: (project, path, root = null) =>
    set({
      project,
      projectPath: path,
      projectRoot: root,
      currentFrameIndex: 0,
      selection: [],
      editing: { edits: {} },
      dirtyTick: 0,
      lastSavedTick: 0,
    }),

  setProjectPath: (path) => set({ projectPath: path }),
  markSaved: () => set((s) => ({ lastSavedTick: s.dirtyTick })),

  setMode: (mode) => set({ mode }),
  setSelection: (selection) => set({ selection }),
  setFrameIndex: (currentFrameIndex) => set({ currentFrameIndex }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),

  addWardrobeVariant: (layerId, variant, select = true) =>
    set(
      produce(
        dirty((s: AppState) => {
          if (!s.project) return;
          for (const c of s.project.scene.characters) {
            const layer = c.layers.find((l) => l.id === layerId);
            if (!layer) continue;
            layer.wardrobe.push({
              id: variant.id,
              name: variant.name,
              asset: { assetId: variant.assetId, file: variant.file },
            });
            if (select) layer.rest.defaultVariantId = variant.id;
            return;
          }
        }),
      ),
    ),

  renameWardrobeVariant: (layerId, variantId, name) =>
    set(
      produce(
        dirty((s: AppState) => {
          forEachLayer(s, layerId, (l) => {
            const v = l.wardrobe.find((w) => w.id === variantId);
            if (v) v.name = name;
          });
        }),
      ),
    ),

  deleteWardrobeVariant: (layerId, variantId) => {
    let ok = false;
    set(
      produce(
        dirty((s: AppState) => {
          forEachLayer(s, layerId, (l) => {
            if (l.wardrobe.length <= 1) return;
            const idx = l.wardrobe.findIndex((w) => w.id === variantId);
            if (idx < 0) return;
            l.wardrobe.splice(idx, 1);
            // If the removed variant was the rest default, fall back to the
            // first remaining variant.
            if (l.rest.defaultVariantId === variantId) {
              l.rest.defaultVariantId = l.wardrobe[0]!.id;
            }
            // Strip frame deltas referencing the dead variant.
            if (s.project) {
              for (const f of s.project.scene.frames) {
                const d = f.layers[layerId];
                if (d && d.variantId === variantId) delete d.variantId;
              }
            }
            ok = true;
          });
        }),
      ),
    );
    return ok;
  },

  setLayerDefaultVariant: (layerId, variantId) =>
    set(
      produce(
        dirty((s: AppState) => {
          forEachLayer(s, layerId, (l) => {
            if (l.wardrobe.some((w) => w.id === variantId)) {
              l.rest.defaultVariantId = variantId;
            }
          });
        }),
      ),
    ),

  addLayer: (characterId, parent, name = "Layer") => {
    let id: string | null = null;
    set(
      produce(
        dirty((s: AppState) => {
          if (!s.project) return;
          const char = s.project.scene.characters.find((c) => c.id === characterId);
          if (!char) return;
          if (parent && !char.layers.some((l) => l.id === parent)) return;
          id = ulid();
          const variantId = ulid();
          const newLayer: Layer = {
            id,
            name,
            parent,
            pivot: { x: 128, y: 128 },
            rest: {
              translation: { x: 0, y: 0 },
              rotation: 0,
              scale: { x: 1, y: 1 },
              visible: true,
              defaultVariantId: variantId,
              defaultZ: 0,
            },
            wardrobe: [
              {
                id: variantId,
                name: "Empty",
                asset: { assetId: "builtin:placeholder", file: "placeholder.png" },
              },
            ],
          };
          char.layers.push(newLayer);
        }),
      ),
    );
    return id;
  },

  deleteLayer: (layerId) =>
    set(
      produce(
        dirty((s: AppState) => {
          if (!s.project) return;
          for (const c of s.project.scene.characters) {
            const idx = c.layers.findIndex((l) => l.id === layerId);
            if (idx < 0) continue;
            // Collect descendants so we can purge them and any frame deltas.
            const toDelete = new Set<string>([layerId]);
            let added = true;
            while (added) {
              added = false;
              for (const l of c.layers) {
                if (l.parent && toDelete.has(l.parent) && !toDelete.has(l.id)) {
                  toDelete.add(l.id);
                  added = true;
                }
              }
            }
            c.layers = c.layers.filter((l) => !toDelete.has(l.id));
            for (const f of s.project.scene.frames) {
              for (const id of toDelete) delete f.layers[id];
            }
            // Drop selection / staged edits referencing deleted layers.
            s.selection = s.selection.filter((t) => !toDelete.has(t));
            for (const id of toDelete) delete s.editing.edits[id];
            return;
          }
        }),
      ),
    ),

  reparentLayer: (layerId, newParent) => {
    let ok = false;
    set(
      produce(
        dirty((s: AppState) => {
          if (!s.project) return;
          for (const c of s.project.scene.characters) {
            const layer = c.layers.find((l) => l.id === layerId);
            if (!layer) continue;
            if (newParent === layerId) return;
            // Reject if newParent is a descendant of layerId (would create a cycle).
            if (newParent) {
              const descendants = new Set<string>([layerId]);
              let added = true;
              while (added) {
                added = false;
                for (const l of c.layers) {
                  if (l.parent && descendants.has(l.parent) && !descendants.has(l.id)) {
                    descendants.add(l.id);
                    added = true;
                  }
                }
              }
              if (descendants.has(newParent)) return;
              if (!c.layers.some((l) => l.id === newParent)) return;
            }
            layer.parent = newParent;
            ok = true;
            return;
          }
        }),
      ),
    );
    return ok;
  },

  setLayerRestTranslation: (layerId, translation) =>
    set(
      produce(
        dirty((s: AppState) => {
          forEachLayer(s, layerId, (l) => {
            l.rest.translation = { ...translation };
          });
        }),
      ),
    ),

  setLayerRestRotation: (layerId, rotation) =>
    set(
      produce(
        dirty((s: AppState) => {
          forEachLayer(s, layerId, (l) => {
            l.rest.rotation = rotation;
          });
        }),
      ),
    ),

  setLayerPivot: (layerId, pivot, translationCompensation) =>
    set(
      produce(
        dirty((s: AppState) => {
          forEachLayer(s, layerId, (l) => {
            l.pivot = { ...pivot };
            if (translationCompensation) {
              l.rest.translation = {
                x: l.rest.translation.x + translationCompensation.x,
                y: l.rest.translation.y + translationCompensation.y,
              };
            }
          });
        }),
      ),
    ),

  renameLayer: (layerId, name) =>
    set(
      produce(
        dirty((s: AppState) => {
          forEachLayer(s, layerId, (l) => {
            l.name = name;
          });
        }),
      ),
    ),

  stageEdit: (target, patch) =>
    set(
      produce((s: AppState) => {
        s.editing.edits[target] = { ...s.editing.edits[target], ...patch };
      }),
    ),

  clearEdits: () => set({ editing: { edits: {} } }),

  captureFrame: (mode) =>
    set(
      produce(
        dirty((s: AppState) => {
          if (!s.project) return;
          const inherited = resolvePose(s.project, s.currentFrameIndex);
          const frame: Frame = { id: ulid(), layers: {} };
          const targets: TargetId[] =
            mode === "all" ? allTargetIds(s.project) : s.selection;
          for (const t of targets) {
            const base = inherited[t];
            if (!base) continue;
            const intended = applyEdit(base, s.editing.edits[t]);
            const delta = diffFields(base, intended);
            if (Object.keys(delta).length > 0) frame.layers[t] = delta;
          }
          s.project.scene.frames.splice(s.currentFrameIndex + 1, 0, frame);
          s.currentFrameIndex += 1;
          s.editing.edits = {};
        }),
      ),
    ),

  insertBlank: () =>
    set(
      produce(
        dirty((s: AppState) => {
          if (!s.project) return;
          s.project.scene.frames.splice(s.currentFrameIndex + 1, 0, { id: ulid(), layers: {} });
          s.currentFrameIndex += 1;
          s.editing.edits = {};
        }),
      ),
    ),

  setOnionSkin: (patch) =>
    set(
      produce(
        dirty((s: AppState) => {
          if (!s.project) return;
          Object.assign(s.project.settings.onionSkin, patch);
        }),
      ),
    ),
}));
