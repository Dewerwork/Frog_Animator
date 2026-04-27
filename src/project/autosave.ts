// Autosave: when the project is dirty and has a path, persist it after a
// debounce window. No-op when not in Tauri or no path is set.

import { useEffect, useRef } from "react";

import { ipc, inTauri } from "@/ipc/tauri";
import { useStore } from "@/state/store";
import { serialize } from "./serialize";

const DEBOUNCE_MS = 1500;

export function useAutosave(): void {
  const timer = useRef<number | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    if (!inTauri()) return;

    const trySave = async () => {
      if (inflight.current) return;
      const s = useStore.getState();
      if (!s.project || !s.projectPath) return;
      if (s.dirtyTick === s.lastSavedTick) return;
      const tickSnapshot = s.dirtyTick;
      try {
        inflight.current = true;
        const json = serialize(s.project);
        await ipc.projectSave(s.projectPath, json);
        // Only mark saved if no further mutations happened during the write.
        if (useStore.getState().dirtyTick === tickSnapshot) {
          useStore.getState().markSaved();
        }
      } catch (e) {
        console.error("autosave failed:", e);
      } finally {
        inflight.current = false;
      }
    };

    const unsubscribe = useStore.subscribe(() => {
      const s = useStore.getState();
      if (s.dirtyTick === s.lastSavedTick) return;
      if (!s.projectPath) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = window.setTimeout(trySave, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
