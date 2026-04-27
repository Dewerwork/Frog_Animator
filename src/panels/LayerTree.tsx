import { useState } from "react";

import type { Character, Layer, TargetId } from "@/model/types";
import { useStore } from "@/state/store";

interface Node {
  layer: Layer;
  depth: number;
}

function flatten(c: Character): Node[] {
  const byParent = new Map<string | null, Layer[]>();
  for (const l of c.layers) {
    const key = l.parent;
    let list = byParent.get(key);
    if (!list) {
      list = [];
      byParent.set(key, list);
    }
    list.push(l);
  }
  const out: Node[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const l of byParent.get(parent) ?? []) {
      out.push({ layer: l, depth });
      walk(l.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function LayerTree() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const reparentLayer = useStore((s) => s.reparentLayer);
  const addLayer = useStore((s) => s.addLayer);
  const deleteLayer = useStore((s) => s.deleteLayer);
  const renameLayer = useStore((s) => s.renameLayer);

  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState<string | null>(null);

  if (!project || project.scene.characters.length === 0) {
    return <div className="h-full bg-panel2 p-2 text-xs text-ink/60">No characters.</div>;
  }

  return (
    <div className="flex h-full flex-col bg-panel2 text-xs">
      {project.scene.characters.map((c) => {
        const nodes = flatten(c);
        return (
          <div key={c.id} className="border-b border-edge">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="font-medium">{c.name}</span>
              <button
                onClick={() => addLayer(c.id, null, "Layer")}
                className="rounded border border-edge px-1.5 text-ink/70 hover:text-ink"
                title="Add top-level layer"
              >
                +
              </button>
            </div>

            {/* Drop zone for top-level (parent === null). */}
            <DropZone
              active={hoverId === null && dragId !== null}
              onEnter={() => setHoverId(null)}
              onLeave={() => setHoverId(undefined)}
              onDrop={() => {
                if (dragId) reparentLayer(dragId, null);
                setDragId(null);
                setHoverId(undefined);
              }}
              label="(top level)"
            />

            <ul>
              {nodes.map(({ layer, depth }) => {
                const selected = selection.includes(layer.id as TargetId);
                const isHover = hoverId === layer.id;
                return (
                  <li
                    key={layer.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(layer.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", layer.id);
                    }}
                    onDragOver={(e) => {
                      if (!dragId || dragId === layer.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setHoverId(layer.id);
                    }}
                    onDragLeave={() => {
                      if (hoverId === layer.id) setHoverId(undefined);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) reparentLayer(dragId, layer.id);
                      setDragId(null);
                      setHoverId(undefined);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setHoverId(undefined);
                    }}
                    onClick={() => setSelection([layer.id as TargetId])}
                    onDoubleClick={() => setEditing(layer.id)}
                    className={`flex items-center gap-1 px-2 py-1 ${
                      selected ? "bg-accent/20 text-accent" : "hover:bg-panel/60"
                    } ${isHover ? "outline outline-1 outline-accent" : ""}`}
                    style={{ paddingLeft: 8 + depth * 12 }}
                    title={layer.id}
                  >
                    <span className="text-ink/40">▸</span>
                    {editing === layer.id ? (
                      <input
                        autoFocus
                        defaultValue={layer.name}
                        onBlur={(e) => {
                          renameLayer(layer.id, e.currentTarget.value);
                          setEditing(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            renameLayer(layer.id, e.currentTarget.value);
                            setEditing(null);
                          } else if (e.key === "Escape") {
                            setEditing(null);
                          }
                        }}
                        className="flex-1 rounded border border-edge bg-panel px-1 text-ink"
                      />
                    ) : (
                      <span className="flex-1 truncate">{layer.name}</span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addLayer(c.id, layer.id, "Child");
                      }}
                      className="text-ink/40 hover:text-ink"
                      title="Add child"
                    >
                      +
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${layer.name}" and its children?`))
                          deleteLayer(layer.id);
                      }}
                      className="text-ink/40 hover:text-red-300"
                      title="Delete"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function DropZone(props: {
  active: boolean;
  label: string;
  onEnter: () => void;
  onLeave: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        props.onEnter();
      }}
      onDragLeave={props.onLeave}
      onDrop={(e) => {
        e.preventDefault();
        props.onDrop();
      }}
      className={`mx-2 mb-1 rounded border border-dashed px-2 py-0.5 text-[10px] uppercase tracking-wide ${
        props.active ? "border-accent text-accent" : "border-edge text-ink/30"
      }`}
    >
      {props.label}
    </div>
  );
}
