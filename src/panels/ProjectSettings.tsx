import { useStore } from "@/state/store";

export function ProjectSettings() {
  const project = useStore((s) => s.project);
  if (!project) return null;
  const { fps } = project.settings;
  const { width, height } = project.scene.canvas;
  return (
    <div className="flex items-center gap-3 text-xs text-ink/70">
      <span>
        {width} x {height}
      </span>
      <span>{fps} fps</span>
    </div>
  );
}
