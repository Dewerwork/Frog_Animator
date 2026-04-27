import { useEffect, useRef } from "react";

import { useStore } from "@/state/store";
import { createStage, type StageHandles } from "@/render/stage";

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handlesRef = useRef<StageHandles | null>(null);
  const project = useStore((s) => s.project);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    const { width, height } = project.scene.canvas;
    createStage(canvas, width, height).then((h) => {
      if (cancelled) {
        h.destroy();
        return;
      }
      handlesRef.current = h;
    });
    return () => {
      cancelled = true;
      handlesRef.current?.destroy();
      handlesRef.current = null;
    };
  }, [project]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-panel">
      <canvas ref={canvasRef} className="border border-edge shadow-lg" />
    </div>
  );
}
