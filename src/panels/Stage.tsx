import { useEffect, useRef } from "react";
import type { FederatedPointerEvent, Sprite } from "pixi.js";

import { useStore } from "@/state/store";
import { createStage, type StageHandles } from "@/render/stage";
import { composeInto, createComposeState, type ComposeState } from "@/rig/compose";
import { resolvePose } from "@/rig/resolve";
import type { Layer, TargetId } from "@/model/types";

interface DragState {
  pointerId: number;
  layerId: string;
  // Pointer offset within sprite at drag start, in stage coords.
  startStage: { x: number; y: number };
  startTranslation: { x: number; y: number };
}

export function Stage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handlesRef = useRef<StageHandles | null>(null);
  const composeStateRef = useRef<ComposeState>(createComposeState());
  const dragRef = useRef<DragState | null>(null);

  // Mount Pixi once. Re-mounting on every project change would be wasteful;
  // composeInto() reconciles in place.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const project = useStore.getState().project;
    if (!project) return;

    const canvas = document.createElement("canvas");
    host.appendChild(canvas);
    let cancelled = false;

    createStage(canvas, project.scene.canvas.width, project.scene.canvas.height).then((h) => {
      if (cancelled) {
        h.destroy();
        canvas.remove();
        return;
      }
      handlesRef.current = h;
      drawNow();
    });

    return () => {
      cancelled = true;
      handlesRef.current?.destroy();
      handlesRef.current = null;
      canvas.remove();
      composeStateRef.current = createComposeState();
    };
  }, []);

  // Subscribe to store and redraw on relevant slices. Zustand v4 gives us
  // selector subscriptions via subscribeWithSelector — but to keep the deps
  // light we just subscribe to the whole store and bail early in drawNow.
  useEffect(() => {
    const draw = () => drawNow();
    return useStore.subscribe(draw);
  }, []);

  function drawNow() {
    const handles = handlesRef.current;
    if (!handles) return;
    const s = useStore.getState();
    if (!s.project) return;

    const inherited = resolvePose(s.project, s.currentFrameIndex);
    const display = { ...inherited };
    for (const [t, e] of Object.entries(s.editing.edits)) {
      const base = inherited[t as TargetId];
      if (!base) continue;
      display[t as TargetId] = {
        translation: e.translation ?? base.translation,
        rotation: e.rotation ?? base.rotation,
        scale: e.scale ?? base.scale,
        visible: e.visible ?? base.visible,
        variantId: e.variantId ?? base.variantId,
        z: e.z ?? base.z,
      };
    }

    composeInto(handles.current, s.project, display, composeStateRef.current, ({ sprite, layer }) => {
      attachDrag(sprite, layer);
    });
  }

  function attachDrag(sprite: Sprite, layer: Layer) {
    sprite.on("pointerdown", (e: FederatedPointerEvent) => {
      const handles = handlesRef.current;
      if (!handles) return;
      const stagePos = handles.app.stage.toLocal(e.global);
      const s = useStore.getState();
      if (!s.project) return;
      const pose = resolvePose(s.project, s.currentFrameIndex);
      const cur = pose[layer.id as TargetId];
      if (!cur) return;
      const edited = s.editing.edits[layer.id as TargetId]?.translation ?? cur.translation;
      dragRef.current = {
        pointerId: e.pointerId,
        layerId: layer.id,
        startStage: { x: stagePos.x, y: stagePos.y },
        startTranslation: { x: edited.x, y: edited.y },
      };
      s.setSelection([layer.id as TargetId]);
      sprite.cursor = "grabbing";
    });

    sprite.on("globalpointermove", (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      const handles = handlesRef.current;
      if (!drag || !handles || drag.pointerId !== e.pointerId) return;
      const stagePos = handles.app.stage.toLocal(e.global);
      const dx = stagePos.x - drag.startStage.x;
      const dy = stagePos.y - drag.startStage.y;
      useStore.getState().stageEdit(drag.layerId as TargetId, {
        translation: {
          x: drag.startTranslation.x + dx,
          y: drag.startTranslation.y + dy,
        },
      });
    });

    const endDrag = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.pointerId === e.pointerId) dragRef.current = null;
      sprite.cursor = "grab";
    };
    sprite.on("pointerup", endDrag);
    sprite.on("pointerupoutside", endDrag);
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-panel">
      <div ref={containerRef} className="border border-edge shadow-lg" />
    </div>
  );
}
