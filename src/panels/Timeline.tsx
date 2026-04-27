// Dopesheet: per-target rows with override dots, frame number header,
// click-to-scrub, drag-to-reorder, right-click for frame ops.

import { useMemo, useRef, useState } from "react";

import type { Project, TargetId } from "@/model/types";
import { useStore } from "@/state/store";
import { frameCount } from "@/state/selectors";

const COL_W = 18;
const ROW_H = 18;

interface Row {
  id: TargetId;
  label: string;
  depth: number;
}

function buildRows(project: Project): Row[] {
  const rows: Row[] = [];
  for (const c of project.scene.characters) {
    rows.push({ id: `${c.id}:root` as TargetId, label: `${c.name} ⚓`, depth: 0 });
    // Walk layer tree depth-first.
    const byParent = new Map<string | null, typeof c.layers>();
    for (const l of c.layers) {
      const k = l.parent;
      const list = byParent.get(k) ?? [];
      list.push(l);
      byParent.set(k, list);
    }
    const walk = (parent: string | null, depth: number) => {
      for (const l of byParent.get(parent) ?? []) {
        rows.push({ id: l.id as TargetId, label: l.name, depth });
        walk(l.id, depth + 1);
      }
    };
    walk(null, 1);
  }
  if (project.scene.background) {
    rows.push({
      id: `bg:${project.scene.background.id}` as TargetId,
      label: project.scene.background.name,
      depth: 0,
    });
  }
  return rows;
}

export function Timeline() {
  const project = useStore((s) => s.project);
  const i = useStore((s) => s.currentFrameIndex);
  const setFrameIndex = useStore((s) => s.setFrameIndex);
  const setSelection = useStore((s) => s.setSelection);
  const moveFrame = useStore((s) => s.moveFrame);

  const total = frameCount(project);
  const rows = useMemo(() => (project ? buildRows(project) : []), [project]);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  if (!project) return null;

  return (
    <div className="grid h-full grid-cols-[140px_1fr] grid-rows-[24px_1fr] bg-panel2 text-xs">
      <div className="border-b border-r border-edge px-2 py-1 text-ink/60">
        Frame {i + 1} / {total}
      </div>

      {/* Frame number header — also the drag-to-reorder handle. */}
      <div ref={scrollerRef} className="overflow-x-auto border-b border-edge">
        <div className="flex h-6" style={{ width: total * COL_W }}>
          {Array.from({ length: total }, (_, idx) => (
            <button
              key={idx}
              draggable
              onClick={() => setFrameIndex(idx)}
              onDragStart={(e) => {
                setDragIndex(idx);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(idx));
              }}
              onDragOver={(e) => {
                if (dragIndex === null || dragIndex === idx) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropIndex(idx);
              }}
              onDragLeave={() => {
                if (dropIndex === idx) setDropIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveFrame(dragIndex, idx);
                setDragIndex(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
              className={`h-full shrink-0 border-r border-edge font-mono ${
                idx === i ? "bg-accent/20 text-accent" : "text-ink/60 hover:bg-panel/60"
              } ${dropIndex === idx ? "bg-accent/40" : ""}`}
              style={{ width: COL_W }}
              title={`Frame ${idx + 1} — drag to reorder`}
            >
              {(idx + 1) % 5 === 0 || idx === 0 ? idx + 1 : "·"}
            </button>
          ))}
        </div>
      </div>

      {/* Row labels (left column). */}
      <div className="overflow-y-auto border-r border-edge">
        {rows.map((r) => (
          <div
            key={r.id}
            onClick={() => setSelection([r.id])}
            className="cursor-pointer truncate px-2 py-0.5 text-ink/80 hover:bg-panel/60"
            style={{ height: ROW_H, paddingLeft: 8 + r.depth * 10 }}
            title={r.id}
          >
            {r.label}
          </div>
        ))}
      </div>

      {/* Dot grid. Synchronized horizontally with header via shared scroller. */}
      <div
        className="overflow-auto"
        onScroll={(e) => {
          // Keep header scroll in sync.
          if (scrollerRef.current) {
            scrollerRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
      >
        <div
          className="relative"
          style={{ width: total * COL_W, height: rows.length * ROW_H }}
        >
          {/* Vertical lane for current frame index. */}
          <div
            className="pointer-events-none absolute top-0 bg-accent/10"
            style={{ left: i * COL_W, width: COL_W, height: rows.length * ROW_H }}
          />
          {rows.map((r, ri) =>
            project.scene.frames.map((f, fi) => {
              const has = f.layers[r.id] && Object.keys(f.layers[r.id]!).length > 0;
              return (
                <button
                  key={`${r.id}:${fi}`}
                  onClick={() => {
                    setFrameIndex(fi);
                    setSelection([r.id]);
                  }}
                  className="absolute"
                  style={{
                    left: fi * COL_W,
                    top: ri * ROW_H,
                    width: COL_W,
                    height: ROW_H,
                  }}
                  title={
                    has ? `${r.label} @ frame ${fi + 1}: ${describeDelta(f.layers[r.id]!)}` : ""
                  }
                >
                  {has ? (
                    <span
                      className="block rounded-sm bg-accent"
                      style={{ width: COL_W - 6, height: ROW_H - 8, margin: "4px 3px" }}
                    />
                  ) : null}
                </button>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

function describeDelta(d: object): string {
  return Object.keys(d).join(",");
}
