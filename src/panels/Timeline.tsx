import { useStore } from "@/state/store";
import { frameCount } from "@/state/selectors";

export function Timeline() {
  const project = useStore((s) => s.project);
  const i = useStore((s) => s.currentFrameIndex);
  const setFrameIndex = useStore((s) => s.setFrameIndex);
  const total = frameCount(project);

  return (
    <div className="flex h-full flex-col bg-panel2 p-2 text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-ink/60">Frame</span>
        <span className="font-mono">
          {i + 1} / {total}
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {Array.from({ length: total }, (_, idx) => (
          <button
            key={idx}
            onClick={() => setFrameIndex(idx)}
            className={`h-10 w-6 shrink-0 rounded-sm border ${
              idx === i ? "border-accent bg-accent/20" : "border-edge bg-panel"
            }`}
            title={`Frame ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
