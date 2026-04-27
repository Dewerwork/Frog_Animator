import { useEffect } from "react";
import { tinykeys } from "tinykeys";

import { LayerTree } from "@/panels/LayerTree";
import { ProjectSettings } from "@/panels/ProjectSettings";
import { Properties } from "@/panels/Properties";
import { RigMode } from "@/panels/RigMode";
import { Stage } from "@/panels/Stage";
import { Timeline } from "@/panels/Timeline";
import { Wardrobe } from "@/panels/Wardrobe";
import { useStore } from "@/state/store";
import { frameCount } from "@/state/selectors";

export function App() {
  useEffect(() => {
    const unbind = tinykeys(window, {
      Space: (e) => {
        e.preventDefault();
        useStore.getState().captureFrame("all");
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
    });
    return () => unbind();
  }, []);

  return (
    <div className="grid h-screen w-screen grid-rows-[auto_1fr_220px] bg-panel text-ink">
      <header className="flex items-center justify-between border-b border-edge bg-panel2 px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Frog Animator</span>
          <RigMode />
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
        <aside className="grid grid-rows-2 border-l border-edge">
          <Properties />
          <Wardrobe />
        </aside>
      </main>

      <footer className="border-t border-edge">
        <Timeline />
      </footer>
    </div>
  );
}
