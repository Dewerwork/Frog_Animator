import type { Layer, TargetId } from "@/model/types";
import { useStore } from "@/state/store";
import { resolvePoseCached } from "@/rig/resolve";

function findLayer(layerId: string): Layer | null {
  const project = useStore.getState().project;
  if (!project) return null;
  for (const c of project.scene.characters) {
    const l = c.layers.find((x) => x.id === layerId);
    if (l) return l;
  }
  return null;
}

export function Properties() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const currentFrameIndex = useStore((s) => s.currentFrameIndex);
  const editing = useStore((s) => s.editing);
  const mode = useStore((s) => s.mode);
  const stageEdit = useStore((s) => s.stageEdit);

  if (!project || selection.length === 0) {
    return <div className="h-full bg-panel2 p-2 text-xs text-ink/40">Nothing selected.</div>;
  }
  const target = selection[0]!;
  const isLayerTarget = typeof target === "string" && !target.includes(":");
  if (!isLayerTarget) {
    return (
      <div className="h-full bg-panel2 p-2 text-xs text-ink/60">
        Selected: <span className="font-mono">{target}</span>
      </div>
    );
  }

  const layer = findLayer(target);
  if (!layer) return null;
  const dirtyTick = useStore.getState().dirtyTick;
  const inherited = resolvePoseCached(project, currentFrameIndex, dirtyTick)[target as TargetId];
  if (!inherited) return null;

  const eb = editing.edits[target as TargetId];
  const cur = {
    translation: eb?.translation ?? inherited.translation,
    rotation: eb?.rotation ?? inherited.rotation,
    scale: eb?.scale ?? inherited.scale,
    z: eb?.z ?? inherited.z,
    variantId: eb?.variantId ?? inherited.variantId,
  };

  const adjustZ = (delta: number) => {
    if (mode === "rig") {
      // Mutate rest defaultZ directly. Simpler than carving a new action;
      // this is the only "rest z" surface we expose.
      useStore.setState(
        (s) => {
          if (!s.project) return s;
          for (const c of s.project.scene.characters) {
            const l = c.layers.find((x) => x.id === target);
            if (l) l.rest.defaultZ += delta;
          }
          return { ...s, dirtyTick: s.dirtyTick + 1 };
        },
      );
    } else {
      stageEdit(target as TargetId, { z: cur.z + delta });
    }
  };

  return (
    <div className="flex h-full flex-col gap-1 bg-panel2 p-2 text-xs">
      <div className="text-ink/60">Properties — {layer.name}</div>

      <Row label="x">
        <NumInput
          value={cur.translation.x}
          step={1}
          onChange={(x) =>
            stageEdit(target as TargetId, { translation: { x, y: cur.translation.y } })
          }
        />
      </Row>
      <Row label="y">
        <NumInput
          value={cur.translation.y}
          step={1}
          onChange={(y) =>
            stageEdit(target as TargetId, { translation: { x: cur.translation.x, y } })
          }
        />
      </Row>
      <Row label="rot°">
        <NumInput
          value={(cur.rotation * 180) / Math.PI}
          step={1}
          onChange={(deg) => stageEdit(target as TargetId, { rotation: (deg * Math.PI) / 180 })}
        />
      </Row>
      <Row label="sx">
        <NumInput
          value={cur.scale.x}
          step={0.05}
          onChange={(x) => stageEdit(target as TargetId, { scale: { x, y: cur.scale.y } })}
        />
      </Row>
      <Row label="sy">
        <NumInput
          value={cur.scale.y}
          step={0.05}
          onChange={(y) => stageEdit(target as TargetId, { scale: { x: cur.scale.x, y } })}
        />
      </Row>

      <div className="mt-2 flex items-center gap-1">
        <span className="w-8 text-ink/60">z</span>
        <span className="flex-1 font-mono">{cur.z}</span>
        <button
          onClick={() => adjustZ(-1)}
          className="rounded border border-edge px-2"
          title="Move down (z−1)"
        >
          ↓
        </button>
        <button
          onClick={() => adjustZ(+1)}
          className="rounded border border-edge px-2"
          title="Move up (z+1)"
        >
          ↑
        </button>
      </div>

      <div className="mt-2 truncate text-[10px] text-ink/40">
        layer: <span className="font-mono">{layer.id}</span>
      </div>
    </div>
  );
}

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-8 text-ink/60">{props.label}</span>
      {props.children}
    </div>
  );
}

function NumInput(props: { value: number; step: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      value={Number.isFinite(props.value) ? Number(props.value.toFixed(3)) : 0}
      step={props.step}
      onChange={(e) => {
        const n = parseFloat(e.currentTarget.value);
        if (Number.isFinite(n)) props.onChange(n);
      }}
      className="flex-1 rounded border border-edge bg-panel px-1 py-0.5 font-mono"
    />
  );
}
