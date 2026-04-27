import { useStore } from "@/state/store";

export function RigMode() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  return (
    <button
      onClick={() => setMode(mode === "rig" ? "animate" : "rig")}
      className={`rounded border px-2 py-1 text-xs ${
        mode === "rig" ? "border-accent bg-accent/20 text-accent" : "border-edge text-ink/80"
      }`}
      title="Toggle rig mode"
    >
      {mode === "rig" ? "Rig mode" : "Animate"}
    </button>
  );
}
