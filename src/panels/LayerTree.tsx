import { useStore } from "@/state/store";

export function LayerTree() {
  const project = useStore((s) => s.project);
  return (
    <div className="h-full overflow-auto bg-panel2 p-2 text-xs">
      <div className="mb-2 text-ink/60">Layers</div>
      {project?.scene.characters.length === 0 ? (
        <div className="text-ink/40">No characters yet.</div>
      ) : (
        project?.scene.characters.map((c) => (
          <div key={c.id} className="mb-2">
            <div className="font-medium">{c.name}</div>
            <ul className="ml-2">
              {c.layers.map((l) => (
                <li key={l.id} className="text-ink/80">
                  {l.name}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
