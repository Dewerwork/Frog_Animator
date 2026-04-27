import { useStore } from "@/state/store";

export function Properties() {
  const selection = useStore((s) => s.selection);
  return (
    <div className="h-full bg-panel2 p-2 text-xs">
      <div className="mb-2 text-ink/60">Properties</div>
      {selection.length === 0 ? (
        <div className="text-ink/40">Nothing selected.</div>
      ) : (
        <ul>
          {selection.map((t) => (
            <li key={t} className="font-mono text-ink/80">
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
