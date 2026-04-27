// Single Zustand store. Mutations go through Immer for structural sharing
// and so the history layer can record patches.

import { create } from "zustand";
import { produce } from "immer";
import { ulid } from "ulid";

import type { Character, Frame, Project, TargetId, FrameLayerState } from "@/model/types";
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

  /** Stage a sparse delta into the editing buffer. */
  stageEdit: (target: TargetId, patch: FrameLayerState) => void;
  clearEdits: () => void;

  /** Commit edits → new Frame inserted after currentFrameIndex. */
  captureFrame: (mode: "all" | "selected") => void;
  /** Insert an empty frame after currentFrameIndex (== "hold previous"). */
  insertBlank: () => void;
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
  const layerId = "layer-frog-body";
  const variantId = "variant-frog-default";
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
        id: layerId,
        name: "Body",
        parent: null,
        // Pivot at image center — texture is 256x256 procedurally.
        pivot: { x: 128, y: 128 },
        rest: {
          translation: { x: 640, y: 360 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          visible: true,
          defaultVariantId: variantId,
          defaultZ: 0,
        },
        wardrobe: [
          {
            id: variantId,
            name: "Default",
            asset: { assetId: BUILTIN_FROG_ASSET, file: "frog.png" },
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
}));
