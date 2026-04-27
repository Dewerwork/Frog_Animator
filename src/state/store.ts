// Single Zustand store. Mutations go through Immer's produceWithPatches so
// the history layer can replay/reverse them. Each user-facing action becomes
// one history entry.

import { create } from "zustand";
import {
  applyPatches,
  enablePatches,
  produce,
  produceWithPatches,
  type Patch,
} from "immer";
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

enablePatches();

export interface EditingBuffer {
  edits: Record<TargetId, FrameLayerState>;
}

export type EditorMode = "animate" | "rig";

export interface AppState {
  project: Project | null;
  projectPath: string | null;
  projectRoot: string | null;
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

  addWardrobeVariant: (
    layerId: string,
    variant: { id: string; name: string; assetId: string; file: string },
    select?: boolean,
  ) => void;
  renameWardrobeVariant: (layerId: string, variantId: string, name: string) => void;
  deleteWardrobeVariant: (layerId: string, variantId: string) => boolean;
  setLayerDefaultVariant: (layerId: string, variantId: string) => void;

  addLayer: (characterId: string, parent: string | null, name?: string) => string | null;
  deleteLayer: (layerId: string) => void;
  reparentLayer: (layerId: string, newParent: string | null) => boolean;
  setLayerRestTranslation: (layerId: string, translation: Vec2) => void;
  setLayerRestRotation: (layerId: string, rotation: number) => void;
  setLayerPivot: (layerId: string, pivot: Vec2, translationCompensation?: Vec2) => void;
  renameLayer: (layerId: string, name: string) => void;

  stageEdit: (target: TargetId, patch: FrameLayerState) => void;
  clearEdits: () => void;

  captureFrame: (mode: "all" | "selected") => void;
  insertBlank: () => void;
  insertHold: (count: number) => void;
  duplicateFrame: (index?: number) => void;
  deleteFrame: (index?: number) => void;
  moveFrame: (from: number, to: number) => boolean;

  setOnionSkin: (patch: Partial<{
    enabled: boolean;
    before: number;
    after: number;
    tintBefore: number;
    tintAfter: number;
  }>) => void;

  addAudioTrack: (track: {
    id: string;
    name: string;
    file: string;
    offsetSeconds?: number;
    gainDb?: number;
    muted?: boolean;
  }) => void;
  setAudioOffset: (trackId: string, offsetSeconds: number) => void;
  setAudioGain: (trackId: string, gainDb: number) => void;
  setAudioMuted: (trackId: string, muted: boolean) => void;
  renameAudioTrack: (trackId: string, name: string) => void;
  deleteAudioTrack: (trackId: string) => void;
}

// ── helpers ────────────────────────────────────────────────────────────────

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
          { id: bodyVariant, name: "Default", asset: { assetId: "builtin:frog", file: "frog.png" } },
        ],
      },
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
          { id: eyeVariant, name: "Default", asset: { assetId: "builtin:eye", file: "eye.png" } },
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

// ── history (Immer patches) ────────────────────────────────────────────────

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

const HISTORY_LIMIT = 200;
const undoStack: HistoryEntry[] = [];
const redoStack: HistoryEntry[] = [];

export function canUndo(): boolean {
  return undoStack.length > 0;
}
export function canRedo(): boolean {
  return redoStack.length > 0;
}
export function historyDepth(): { undo: number; redo: number } {
  return { undo: undoStack.length, redo: redoStack.length };
}
export function clearHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
}

export function undo(): string | null {
  const e = undoStack.pop();
  if (!e) return null;
  useStore.setState(
    (prev) => applyPatches(prev as unknown as Record<string, unknown>, e.inverse) as unknown as AppState,
    true,
  );
  redoStack.push(e);
  return e.label;
}

export function redo(): string | null {
  const e = redoStack.pop();
  if (!e) return null;
  useStore.setState(
    (prev) => applyPatches(prev as unknown as Record<string, unknown>, e.patches) as unknown as AppState,
    true,
  );
  undoStack.push(e);
  return e.label;
}

function validateInvariants(s: AppState, label: string): void {
  if (!s.project) return;
  const valid = new Set<string>();
  for (const c of s.project.scene.characters) {
    valid.add(`${c.id}:root`);
    for (const l of c.layers) valid.add(l.id);
  }
  if (s.project.scene.background) valid.add(`bg:${s.project.scene.background.id}`);
  for (let i = 0; i < s.project.scene.frames.length; i++) {
    const f = s.project.scene.frames[i];
    if (!f) continue;
    for (const k of Object.keys(f.layers)) {
      if (!valid.has(k)) {
        // eslint-disable-next-line no-console
        console.error(
          `[invariant] action="${label}" frame[${i}] references unknown target "${k}"`,
        );
      }
    }
  }
}

/** Wraps a recipe so `set(commit("label", r))` produces patches, pushes
 *  history, and bumps dirtyTick atomically. */
function commit(
  label: string,
  recipe: (s: AppState) => void,
): (prev: AppState) => AppState {
  return (prev) => {
    const [next, patches, inverse] = produceWithPatches(prev, (d: AppState) => {
      recipe(d);
      d.dirtyTick = d.dirtyTick + 1;
    });
    if (patches.length === 0) return prev;
    undoStack.push({ label, patches, inverse });
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    validateInvariants(next, label);
    return next;
  };
}

// ── store ──────────────────────────────────────────────────────────────────

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

  setProject: (project, path, root = null) => {
    clearHistory();
    set({
      project,
      projectPath: path,
      projectRoot: root,
      currentFrameIndex: 0,
      selection: [],
      editing: { edits: {} },
      dirtyTick: 0,
      lastSavedTick: 0,
    });
  },

  setProjectPath: (path) => set({ projectPath: path }),
  markSaved: () => set((s) => ({ lastSavedTick: s.dirtyTick })),

  setMode: (mode) => set({ mode }),
  setSelection: (selection) => set({ selection }),
  setFrameIndex: (currentFrameIndex) => set({ currentFrameIndex }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),

  addWardrobeVariant: (layerId, variant, select = true) =>
    set(
      commit("addWardrobeVariant", (s) => {
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

  renameWardrobeVariant: (layerId, variantId, name) =>
    set(
      commit("renameWardrobeVariant", (s) => {
        forEachLayer(s, layerId, (l) => {
          const v = l.wardrobe.find((w) => w.id === variantId);
          if (v) v.name = name;
        });
      }),
    ),

  deleteWardrobeVariant: (layerId, variantId) => {
    let ok = false;
    set(
      commit("deleteWardrobeVariant", (s) => {
        forEachLayer(s, layerId, (l) => {
          if (l.wardrobe.length <= 1) return;
          const idx = l.wardrobe.findIndex((w) => w.id === variantId);
          if (idx < 0) return;
          l.wardrobe.splice(idx, 1);
          if (l.rest.defaultVariantId === variantId) {
            l.rest.defaultVariantId = l.wardrobe[0]!.id;
          }
          if (s.project) {
            for (const f of s.project.scene.frames) {
              const d = f.layers[layerId];
              if (d && d.variantId === variantId) delete d.variantId;
            }
          }
          ok = true;
        });
      }),
    );
    return ok;
  },

  setLayerDefaultVariant: (layerId, variantId) =>
    set(
      commit("setLayerDefaultVariant", (s) => {
        forEachLayer(s, layerId, (l) => {
          if (l.wardrobe.some((w) => w.id === variantId)) {
            l.rest.defaultVariantId = variantId;
          }
        });
      }),
    ),

  addLayer: (characterId, parent, name = "Layer") => {
    let id: string | null = null;
    set(
      commit("addLayer", (s) => {
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
    );
    return id;
  },

  deleteLayer: (layerId) =>
    set(
      commit("deleteLayer", (s) => {
        if (!s.project) return;
        for (const c of s.project.scene.characters) {
          const idx = c.layers.findIndex((l) => l.id === layerId);
          if (idx < 0) continue;
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
          s.selection = s.selection.filter((t) => !toDelete.has(t));
          for (const id of toDelete) delete s.editing.edits[id];
          return;
        }
      }),
    ),

  reparentLayer: (layerId, newParent) => {
    let ok = false;
    set(
      commit("reparentLayer", (s) => {
        if (!s.project) return;
        for (const c of s.project.scene.characters) {
          const layer = c.layers.find((l) => l.id === layerId);
          if (!layer) continue;
          if (newParent === layerId) return;
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
    );
    return ok;
  },

  setLayerRestTranslation: (layerId, translation) =>
    set(
      commit("setLayerRestTranslation", (s) => {
        forEachLayer(s, layerId, (l) => {
          l.rest.translation = { ...translation };
        });
      }),
    ),

  setLayerRestRotation: (layerId, rotation) =>
    set(
      commit("setLayerRestRotation", (s) => {
        forEachLayer(s, layerId, (l) => {
          l.rest.rotation = rotation;
        });
      }),
    ),

  setLayerPivot: (layerId, pivot, translationCompensation) =>
    set(
      commit("setLayerPivot", (s) => {
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

  renameLayer: (layerId, name) =>
    set(
      commit("renameLayer", (s) => {
        forEachLayer(s, layerId, (l) => {
          l.name = name;
        });
      }),
    ),

  // Staged edits live OUTSIDE history — they're transient until a capture
  // commits them. Drag-driven mutations would explode the stack otherwise.
  stageEdit: (target, patch) =>
    set(
      produce((s: AppState) => {
        s.editing.edits[target] = { ...s.editing.edits[target], ...patch };
      }),
    ),

  clearEdits: () => set({ editing: { edits: {} } }),

  captureFrame: (mode) =>
    set(
      commit("captureFrame", (s) => {
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

  insertBlank: () =>
    set(
      commit("insertBlank", (s) => {
        if (!s.project) return;
        s.project.scene.frames.splice(s.currentFrameIndex + 1, 0, { id: ulid(), layers: {} });
        s.currentFrameIndex += 1;
        s.editing.edits = {};
      }),
    ),

  insertHold: (count) =>
    set(
      commit("insertHold", (s) => {
        if (!s.project || count <= 0) return;
        const blanks: Frame[] = [];
        for (let k = 0; k < count; k++) blanks.push({ id: ulid(), layers: {} });
        s.project.scene.frames.splice(s.currentFrameIndex + 1, 0, ...blanks);
        s.currentFrameIndex += count;
        s.editing.edits = {};
      }),
    ),

  duplicateFrame: (index) =>
    set(
      commit("duplicateFrame", (s) => {
        if (!s.project) return;
        const i = index ?? s.currentFrameIndex;
        const f = s.project.scene.frames[i];
        if (!f) return;
        // JSON clone is fine — frames hold only plain JSON-serializable shapes.
        const clone: Frame = {
          id: ulid(),
          layers: JSON.parse(JSON.stringify(f.layers)) as Frame["layers"],
        };
        s.project.scene.frames.splice(i + 1, 0, clone);
        s.currentFrameIndex = i + 1;
      }),
    ),

  deleteFrame: (index) =>
    set(
      commit("deleteFrame", (s) => {
        if (!s.project) return;
        if (s.project.scene.frames.length <= 1) return; // never empty
        const i = index ?? s.currentFrameIndex;
        if (i < 0 || i >= s.project.scene.frames.length) return;
        s.project.scene.frames.splice(i, 1);
        s.currentFrameIndex = Math.min(i, s.project.scene.frames.length - 1);
      }),
    ),

  moveFrame: (from, to) => {
    let ok = false;
    set(
      commit("moveFrame", (s) => {
        if (!s.project) return;
        const total = s.project.scene.frames.length;
        if (from < 0 || from >= total || to < 0 || to >= total || from === to) return;
        const [f] = s.project.scene.frames.splice(from, 1);
        s.project.scene.frames.splice(to, 0, f!);
        // Caveat: moving a frame changes the baseline visible pose at every
        // index ≥ min(from, to). Plan §10 calls out a future "bake absolute
        // values" option; for now we just do the straight move.
        s.currentFrameIndex = to;
        ok = true;
      }),
    );
    return ok;
  },

  setOnionSkin: (patch) =>
    set(
      commit("setOnionSkin", (s) => {
        if (!s.project) return;
        Object.assign(s.project.settings.onionSkin, patch);
      }),
    ),

  addAudioTrack: (track) =>
    set(
      commit("addAudioTrack", (s) => {
        if (!s.project) return;
        s.project.scene.audio.push({
          id: track.id,
          name: track.name,
          file: track.file,
          offsetSeconds: track.offsetSeconds ?? 0,
          gainDb: track.gainDb ?? 0,
          muted: track.muted ?? false,
        });
      }),
    ),

  setAudioOffset: (trackId, offsetSeconds) =>
    set(
      commit("setAudioOffset", (s) => {
        if (!s.project) return;
        const t = s.project.scene.audio.find((x) => x.id === trackId);
        if (t) t.offsetSeconds = offsetSeconds;
      }),
    ),

  setAudioGain: (trackId, gainDb) =>
    set(
      commit("setAudioGain", (s) => {
        if (!s.project) return;
        const t = s.project.scene.audio.find((x) => x.id === trackId);
        if (t) t.gainDb = gainDb;
      }),
    ),

  setAudioMuted: (trackId, muted) =>
    set(
      commit("setAudioMuted", (s) => {
        if (!s.project) return;
        const t = s.project.scene.audio.find((x) => x.id === trackId);
        if (t) t.muted = muted;
      }),
    ),

  renameAudioTrack: (trackId, name) =>
    set(
      commit("renameAudioTrack", (s) => {
        if (!s.project) return;
        const t = s.project.scene.audio.find((x) => x.id === trackId);
        if (t) t.name = name;
      }),
    ),

  deleteAudioTrack: (trackId) =>
    set(
      commit("deleteAudioTrack", (s) => {
        if (!s.project) return;
        s.project.scene.audio = s.project.scene.audio.filter((x) => x.id !== trackId);
      }),
    ),
}));
