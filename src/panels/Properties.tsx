import { useState } from "react";

import type { Layer, LayerConstraints, TargetId, Vec2 } from "@/model/types";
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

      {mode === "rig" ? <ConstraintsSection layer={layer} /> : null}

      <div className="mt-2 truncate text-[10px] text-ink/40">
        layer: <span className="font-mono">{layer.id}</span>
      </div>
    </div>
  );
}

function ConstraintsSection({ layer }: { layer: Layer }) {
  const setLayerConstraints = useStore((s) => s.setLayerConstraints);
  const [expanded, setExpanded] = useState(false);
  const c = layer.constraints;

  const update = (patch: Partial<LayerConstraints>) => {
    const next: LayerConstraints = { ...c, ...patch };
    // If every axis is empty, drop the whole field.
    if (!next.rotation && !next.translation && !next.scale) {
      setLayerConstraints(layer.id, undefined);
    } else {
      setLayerConstraints(layer.id, next);
    }
  };

  return (
    <div className="mt-2 rounded border border-edge">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-2 py-1 text-ink/80"
      >
        <span>Constraints {c ? "•" : ""}</span>
        <span className="text-ink/40">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded ? (
        <div className="space-y-2 p-2">
          <RotationConstraint
            value={c?.rotation}
            onChange={(rotation) => update({ rotation })}
          />
          <BoxConstraint
            label="translation"
            value={c?.translation}
            step={1}
            onChange={(translation) => update({ translation })}
          />
          <BoxConstraint
            label="scale"
            value={c?.scale}
            step={0.1}
            defaultMin={{ x: 0, y: 0 }}
            defaultMax={{ x: 4, y: 4 }}
            onChange={(scale) => update({ scale })}
          />
        </div>
      ) : null}
    </div>
  );
}

function RotationConstraint(props: {
  value: { min: number; max: number } | undefined;
  onChange: (v: { min: number; max: number } | undefined) => void;
}) {
  const enabled = !!props.value;
  const min = props.value?.min ?? -Math.PI / 4;
  const max = props.value?.max ?? Math.PI / 4;
  return (
    <div>
      <label className="flex items-center gap-1 text-ink/70">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            props.onChange(e.currentTarget.checked ? { min, max } : undefined)
          }
        />
        rotation°
      </label>
      {enabled ? (
        <div className="ml-5 grid grid-cols-2 gap-1">
          <Num
            label="min"
            value={(min * 180) / Math.PI}
            step={1}
            onChange={(deg) =>
              props.onChange({ min: (deg * Math.PI) / 180, max })
            }
          />
          <Num
            label="max"
            value={(max * 180) / Math.PI}
            step={1}
            onChange={(deg) =>
              props.onChange({ min, max: (deg * Math.PI) / 180 })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function BoxConstraint(props: {
  label: string;
  value: { min: Vec2; max: Vec2 } | undefined;
  step: number;
  defaultMin?: Vec2;
  defaultMax?: Vec2;
  onChange: (v: { min: Vec2; max: Vec2 } | undefined) => void;
}) {
  const enabled = !!props.value;
  const min = props.value?.min ?? props.defaultMin ?? { x: -1000, y: -1000 };
  const max = props.value?.max ?? props.defaultMax ?? { x: 1000, y: 1000 };
  return (
    <div>
      <label className="flex items-center gap-1 text-ink/70">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            props.onChange(e.currentTarget.checked ? { min, max } : undefined)
          }
        />
        {props.label}
      </label>
      {enabled ? (
        <div className="ml-5 grid grid-cols-4 gap-1">
          <Num label="x≥" value={min.x} step={props.step}
            onChange={(x) => props.onChange({ min: { x, y: min.y }, max })} />
          <Num label="x≤" value={max.x} step={props.step}
            onChange={(x) => props.onChange({ min, max: { x, y: max.y } })} />
          <Num label="y≥" value={min.y} step={props.step}
            onChange={(y) => props.onChange({ min: { x: min.x, y }, max })} />
          <Num label="y≤" value={max.y} step={props.step}
            onChange={(y) => props.onChange({ min, max: { x: max.x, y } })} />
        </div>
      ) : null}
    </div>
  );
}

function Num(props: { label: string; value: number; step: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-[10px] text-ink/50">{props.label}</span>
      <input
        type="number"
        step={props.step}
        value={Number.isFinite(props.value) ? Number(props.value.toFixed(3)) : 0}
        onChange={(e) => {
          const n = parseFloat(e.currentTarget.value);
          if (Number.isFinite(n)) props.onChange(n);
        }}
        className="w-full rounded border border-edge bg-panel px-1 py-0.5 font-mono"
      />
    </label>
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
