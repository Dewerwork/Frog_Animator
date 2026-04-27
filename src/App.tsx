import { useEffect } from "react";
import { tinykeys } from "tinykeys";

import { AudioPanel } from "@/panels/AudioPanel";
import { FileMenu } from "@/panels/FileMenu";
import { LayerTree } from "@/panels/LayerTree";
import { ProjectSettings } from "@/panels/ProjectSettings";
import { Properties } from "@/panels/Properties";
import { RigMode } from "@/panels/RigMode";
import { Stage } from "@/panels/Stage";
import { Timeline } from "@/panels/Timeline";
import { Transport } from "@/panels/Transport";
import { Wardrobe } from "@/panels/Wardrobe";
import { useStore } from "@/state/store";
import { frameCount } from "@/state/selectors";
import { usePlaybackLoop } from "@/state/playback";
import { useAutosave } from "@/project/autosave";
import { newProject, openProject } from "@/project/open";
import { saveProject, saveProjectAs } from "@/project/save";
import { redo, undo } from "@/state/history";
import { startHotReload, startWatching, stopHotReload } from "@/render/hotReload";

/** Whether an event target is a text-entry control we should NOT hijack
 *  with global hotkeys. Lets the user type "v" inside a numeric input
 *  without triggering paste-frames. */
function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function App() {
  usePlaybackLoop();
  useAutosave();

  // Hot-reload subscription is global — set up once. The watcher itself
  // (per-project root) is started by openProject().
  useEffect(() => {
    void startHotReload();
    return () => {
      void stopHotReload();
    };
  }, []);

  // Re-arm the asset watcher whenever the project root changes.
  const projectRoot = useStore((s) => s.projectRoot);
  useEffect(() => {
    if (!projectRoot) return;
    void startWatching(projectRoot);
  }, [projectRoot]);

  useEffect(() => {
    const unbind = tinykeys(window, {
      Space: (e) => {
        e.preventDefault();
        useStore.getState().captureFrame("all");
      },
      "Shift+Space": (e) => {
        e.preventDefault();
        useStore.getState().captureFrame("selected");
      },
      "\\": (e) => {
        e.preventDefault();
        useStore.getState().togglePlay();
      },
      ArrowLeft: (e) => {
        e.preventDefault();
        const s = useStore.getState();
        s.setFrameIndex(Math.max(0, s.currentFrameIndex - 1));
      },
      ArrowRight: (e) => {
        e.preventDefault();
        const s = useStore.getState();
        const total = frameCount(s.project);
        s.setFrameIndex(Math.min(total - 1, s.currentFrameIndex + 1));
      },
      Home: (e) => {
        e.preventDefault();
        useStore.getState().setFrameIndex(0);
      },
      End: (e) => {
        e.preventDefault();
        const s = useStore.getState();
        s.setFrameIndex(Math.max(0, frameCount(s.project) - 1));
      },
      KeyB: (e) => {
        e.preventDefault();
        useStore.getState().insertBlank();
      },
      "$mod+KeyN": (e) => {
        e.preventDefault();
        void newProject();
      },
      "$mod+KeyO": (e) => {
        e.preventDefault();
        void openProject();
      },
      "$mod+KeyS": (e) => {
        e.preventDefault();
        void saveProject();
      },
      "$mod+Shift+KeyS": (e) => {
        e.preventDefault();
        void saveProjectAs();
      },
      "$mod+KeyZ": (e) => {
        e.preventDefault();
        undo();
      },
      "$mod+Shift+KeyZ": (e) => {
        e.preventDefault();
        redo();
      },
      "$mod+KeyY": (e) => {
        // Windows-friendly redo alias.
        e.preventDefault();
        redo();
      },
      "$mod+KeyD": (e) => {
        e.preventDefault();
        useStore.getState().duplicateFrame();
      },
      "$mod+KeyC": (e) => {
        if (isTextTarget(e.target)) return;
        e.preventDefault();
        useStore.getState().copySelectedFrames();
      },
      "$mod+KeyV": (e) => {
        if (isTextTarget(e.target)) return;
        e.preventDefault();
        useStore.getState().pasteFramesInsert();
      },
      "$mod+Shift+KeyV": (e) => {
        if (isTextTarget(e.target)) return;
        e.preventDefault();
        useStore.getState().pasteFramesAppend();
      },
    });
    return () => unbind();
  }, []);

  return (
    <div className="grid h-screen w-screen grid-rows-[auto_1fr_220px] bg-panel text-ink">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge bg-panel2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">Frog Animator</span>
          <FileMenu />
          <RigMode />
          <Transport />
        </div>
        <ProjectSettings />
      </header>

      <main className="grid grid-cols-[220px_1fr_260px] overflow-hidden">
        <aside className="border-r border-edge">
          <LayerTree />
        </aside>
        <section className="overflow-hidden">
          <Stage />
        </section>
        <aside className="grid grid-rows-[1fr_1fr_1fr] overflow-hidden border-l border-edge">
          <div className="overflow-auto">
            <Properties />
          </div>
          <div className="overflow-auto border-t border-edge">
            <Wardrobe />
          </div>
          <div className="overflow-auto border-t border-edge">
            <AudioPanel />
          </div>
        </aside>
      </main>

      <footer className="border-t border-edge">
        <Timeline />
      </footer>
    </div>
  );
}
