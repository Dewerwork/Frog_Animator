import { useStore } from "@/state/store";

export function ProjectSettings() {
  const project = useStore((s) => s.project);
  const setOnionSkin = useStore((s) => s.setOnionSkin);
  if (!project) return null;
  const { fps } = project.settings;
  const { width, height } = project.scene.canvas;
  const onion = project.settings.onionSkin;

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink/70">
      <span>
        {width} × {height}
      </span>
      <span>{fps} fps</span>

      <span className="h-4 border-l border-edge" />

      <label className="flex items-center gap-1" title="Show ghost frames before/after current">
        <input
          type="checkbox"
          checked={onion.enabled}
          onChange={(e) => setOnionSkin({ enabled: e.currentTarget.checked })}
        />
        Onion
      </label>
      <NumStepper
        label="−"
        title="Frames before"
        value={onion.before}
        min={0}
        max={5}
        onChange={(v) => setOnionSkin({ before: v })}
      />
      <NumStepper
        label="+"
        title="Frames after"
        value={onion.after}
        min={0}
        max={5}
        onChange={(v) => setOnionSkin({ after: v })}
      />
    </div>
  );
}

function NumStepper(props: {
  label: string;
  title: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex items-center gap-1" title={props.title}>
      <span className="text-ink/40">{props.label}</span>
      <button
        onClick={() => props.onChange(Math.max(props.min, props.value - 1))}
        className="rounded border border-edge px-1"
      >
        −
      </button>
      <span className="w-3 text-center font-mono">{props.value}</span>
      <button
        onClick={() => props.onChange(Math.min(props.max, props.value + 1))}
        className="rounded border border-edge px-1"
      >
        +
      </button>
    </span>
  );
}
