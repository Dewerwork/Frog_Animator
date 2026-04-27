// Single Zustand store. Mutations go through Immer for structural sharing
// and so the history layer can record patches.

import { create } from "zustand";
import { produce } from "immer";
import { ulid } from "ulid";

import type { Frame, Project, TargetId, FrameLayerState } from "@/model/types";

export interface EditingBuffer {
  // Pending edits for the current frame, keyed by TargetId. Cleared on capture
  // or explicit revert.
  edits: Record<TargetId, FrameLayerState>;
}

export type EditorMode = "animate" | "rig";

export interface AppState {
  project: Project | null;
  projectPath: string | null;

  currentFrameIndex: number;
  selection: TargetId[];
  mode: EditorMode;
  playing: boolean;

  editing: EditingBuffer;

  setProject: (project: Project, path: string | null) => void;
  setMode: (mode: EditorMode) => void;
  setSelection: (sel: TargetId[]) => void;
  setFrameIndex: (i: number) => void;
  togglePlay: () => void;

  /** Stage a sparse delta into the editing buffer. */
  stageEdit: (target: TargetId, patch: FrameLayerState) => void;
  clearEdits: () => void;

  /** Commit edits → new Frame inserted after currentFrameIndex. */
  captureFrame: (mode: "all" | "selected") => void;
}

const initialProject = (): Project => ({
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
    characters: [],
    background: null,
    frames: [{ id: ulid(), layers: {} }],
    audio: [],
  },
});

export const useStore = create<AppState>((set) => ({
  project: initialProject(),
  projectPath: null,
  currentFrameIndex: 0,
  selection: [],
  mode: "animate",
  playing: false,
  editing: { edits: {} },

  setProject: (project, path) =>
    set({ project, projectPath: path, currentFrameIndex: 0, selection: [], editing: { edits: {} } }),

  setMode: (mode) => set({ mode }),
  setSelection: (selection) => set({ selection }),
  setFrameIndex: (currentFrameIndex) => set({ currentFrameIndex }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),

  stageEdit: (target, patch) =>
    set(
      produce((s: AppState) => {
        s.editing.edits[target] = { ...s.editing.edits[target], ...patch };
      }),
    ),

  clearEdits: () => set({ editing: { edits: {} } }),

  captureFrame: (mode) =>
    set(
      produce((s: AppState) => {
        if (!s.project) return;
        const frame: Frame = { id: ulid(), layers: {} };
        const targets =
          mode === "all"
            ? (Object.keys(s.editing.edits) as TargetId[])
            : (s.selection.filter((t) => s.editing.edits[t]) as TargetId[]);
        for (const t of targets) {
          const e = s.editing.edits[t];
          if (e && Object.keys(e).length > 0) frame.layers[t] = e;
        }
        s.project.scene.frames.splice(s.currentFrameIndex + 1, 0, frame);
        s.currentFrameIndex += 1;
        s.editing.edits = {};
      }),
    ),
}));
