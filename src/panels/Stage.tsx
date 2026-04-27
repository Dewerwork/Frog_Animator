import { useEffect, useRef } from "react";
import { Graphics, Point } from "pixi.js";
import type { FederatedPointerEvent, Sprite } from "pixi.js";

import { useStore } from "@/state/store";
import { createStage, type StageHandles } from "@/render/stage";
import { composeInto, createComposeState, type ComposeState } from "@/rig/compose";
import { resolvePose, resolvePoseCached } from "@/rig/resolve";
import type { Layer, TargetId, Vec2 } from "@/model/types";

type DragKind = "translate" | "pivot";

interface DragState {
  kind: DragKind;
  pointerId: number;
  layerId: string;
  /** Pointer position at drag start, in PARENT-LOCAL coords (= the container the sprite lives in). */
  startParent: Vec2;
  startTranslation: Vec2;
  /** For pivot drags: pivot in image-local pixels at drag start. */
  startPivot?: Vec2;
  /** For pivot drags: sprite scale + rotation captured at start. */
  startScale?: Vec2;
  startRotation?: number;
}

export function Stage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handlesRef = useRef<StageHandles | null>(null);
  const composeStateRef = useRef<ComposeState>(createComposeState());
  const onionStatesRef = useRef<Map<number, ComposeState>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const pivotHandleRef = useRef<Graphics | null>(null);

  // Mount Pixi once. composeInto reconciles in place across redraws.
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

    // Smoke-test hooks. Tauri webview is sealed; safe to expose internals.
    type DebugWindow = {
      __getSpriteWorldPos?: (id: string) => { x: number; y: number } | null;
      __getOnionCounts?: () => { before: number; after: number };
    };
    const win = window as unknown as DebugWindow;
    win.__getSpriteWorldPos = (id: string) => {
      const sp = composeStateRef.current.sprites.get(id);
      if (!sp) return null;
      const g = sp.getGlobalPosition();
      return { x: g.x, y: g.y };
    };
    win.__getOnionCounts = () => {
      let before = 0;
      let after = 0;
      for (const [offset, st] of onionStatesRef.current) {
        if (offset < 0) before += st.sprites.size;
        else if (offset > 0) after += st.sprites.size;
      }
      return { before, after };
    };

    return () => {
      cancelled = true;
      handlesRef.current?.destroy();
      handlesRef.current = null;
      canvas.remove();
      composeStateRef.current = createComposeState();
      onionStatesRef.current.clear();
      pivotHandleRef.current = null;
    };
  }, []);

  // Re-render on any store change. drawNow() bails fast if nothing relevant
  // has changed beyond the displayed frame/edits.
  useEffect(() => {
    const draw = () => drawNow();
    return useStore.subscribe(draw);
  }, []);

  function drawNow() {
    const handles = handlesRef.current;
    if (!handles) return;
    const s = useStore.getState();
    if (!s.project) return;

    const inherited = resolvePoseCached(s.project, s.currentFrameIndex, s.dirtyTick);
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

    composeOnion(handles, s);
    updatePivotHandle();
  }

  function composeOnion(handles: StageHandles, s: ReturnType<typeof useStore.getState>) {
    if (!s.project) return;
    const cfg = s.project.settings.onionSkin;
    const states = onionStatesRef.current;

    // Tear down everything if disabled.
    if (!cfg.enabled || (cfg.before === 0 && cfg.after === 0)) {
      handles.onionBefore.visible = false;
      handles.onionAfter.visible = false;
      for (const [, st] of states) {
        for (const sp of st.sprites.values()) {
          sp.removeFromParent();
          sp.destroy({ children: true });
        }
        for (const cr of st.charRoots.values()) {
          cr.removeFromParent();
          cr.destroy({ children: true });
        }
      }
      states.clear();
      return;
    }
    handles.onionBefore.visible = true;
    handles.onionAfter.visible = true;

    const total = s.project.scene.frames.length;
    const wanted = new Set<number>();
    for (let k = 1; k <= cfg.before; k++) {
      const idx = s.currentFrameIndex - k;
      if (idx >= 0) wanted.add(-k);
    }
    for (let k = 1; k <= cfg.after; k++) {
      const idx = s.currentFrameIndex + k;
      if (idx < total) wanted.add(k);
    }

    // Drop unused offsets.
    for (const [offset, st] of states) {
      if (!wanted.has(offset)) {
        for (const sp of st.sprites.values()) {
          sp.removeFromParent();
          sp.destroy({ children: true });
        }
        for (const cr of st.charRoots.values()) {
          cr.removeFromParent();
          cr.destroy({ children: true });
        }
        states.delete(offset);
      }
    }

    for (const offset of wanted) {
      let st = states.get(offset);
      if (!st) {
        st = createComposeState();
        states.set(offset, st);
      }
      const root = offset < 0 ? handles.onionBefore : handles.onionAfter;
      const idx = s.currentFrameIndex + offset;
      const ghostPose = resolvePoseCached(s.project, idx, s.dirtyTick);
      composeInto(root, s.project, ghostPose, st);

      const tint = offset < 0 ? cfg.tintBefore : cfg.tintAfter;
      const dist = Math.abs(offset);
      const span = offset < 0 ? Math.max(1, cfg.before) : Math.max(1, cfg.after);
      const alpha = 0.55 * (1 - (dist - 1) / span); // closest = 0.55, fades out
      for (const sp of st.sprites.values()) {
        sp.tint = tint;
        sp.alpha = Math.max(0.1, alpha);
        sp.eventMode = "none"; // ghosts must not intercept clicks
        sp.cursor = "default";
      }
    }
  }

  function findLayer(layerId: string): Layer | null {
    const s = useStore.getState();
    if (!s.project) return null;
    for (const c of s.project.scene.characters) {
      const l = c.layers.find((x) => x.id === layerId);
      if (l) return l;
    }
    return null;
  }

  function attachDrag(sprite: Sprite, layer: Layer) {
    sprite.on("pointerdown", (e: FederatedPointerEvent) => {
      const handles = handlesRef.current;
      if (!handles) return;
      const parent = sprite.parent;
      if (!parent) return;
      const startParent = parent.toLocal(e.global);
      const s = useStore.getState();
      if (!s.project) return;

      const pose = resolvePose(s.project, s.currentFrameIndex);
      const cur = pose[layer.id as TargetId];
      if (!cur) return;
      const editedTranslation = s.editing.edits[layer.id as TargetId]?.translation ?? cur.translation;

      dragRef.current = {
        kind: "translate",
        pointerId: e.pointerId,
        layerId: layer.id,
        startParent: { x: startParent.x, y: startParent.y },
        startTranslation: { x: editedTranslation.x, y: editedTranslation.y },
      };
      s.setSelection([layer.id as TargetId]);
      sprite.cursor = "grabbing";
    });

    sprite.on("globalpointermove", (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      const handles = handlesRef.current;
      if (!drag || !handles || drag.pointerId !== e.pointerId) return;
      if (drag.kind !== "translate" || drag.layerId !== layer.id) return;
      const parent = sprite.parent;
      if (!parent) return;

      const cur = parent.toLocal(e.global);
      const dx = cur.x - drag.startParent.x;
      const dy = cur.y - drag.startParent.y;
      const next: Vec2 = {
        x: drag.startTranslation.x + dx,
        y: drag.startTranslation.y + dy,
      };

      const s = useStore.getState();
      if (s.mode === "rig") {
        s.setLayerRestTranslation(drag.layerId, next);
      } else {
        s.stageEdit(drag.layerId as TargetId, { translation: next });
      }
    });

    const endDrag = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.pointerId === e.pointerId && drag.kind === "translate") {
        dragRef.current = null;
      }
      sprite.cursor = "grab";
    };
    sprite.on("pointerup", endDrag);
    sprite.on("pointerupoutside", endDrag);
  }

  function updatePivotHandle() {
    const handles = handlesRef.current;
    if (!handles) return;
    const s = useStore.getState();

    // Tear down if not applicable.
    if (s.mode !== "rig" || s.selection.length === 0) {
      if (pivotHandleRef.current) {
        pivotHandleRef.current.removeFromParent();
        pivotHandleRef.current.destroy();
        pivotHandleRef.current = null;
      }
      return;
    }

    const layerId = s.selection.find((t) => !String(t).includes(":")) as string | undefined;
    if (!layerId) return;
    const sprite = composeStateRef.current.sprites.get(layerId);
    const layer = findLayer(layerId);
    if (!sprite || !layer || !sprite.parent) return;

    let g = pivotHandleRef.current;
    if (!g) {
      g = new Graphics();
      g.eventMode = "static";
      g.cursor = "crosshair";
      g.zIndex = 99999;
      pivotHandleRef.current = g;
      attachPivotDrag(g, layerId);
    }
    if (g.parent !== sprite.parent) sprite.parent.addChild(g);

    g.clear();
    g.circle(0, 0, 8).fill({ color: 0xffaa33, alpha: 0.85 }).stroke({ color: 0x222222, width: 2 });
    g.moveTo(-12, 0).lineTo(12, 0).moveTo(0, -12).lineTo(0, 12).stroke({ color: 0xffaa33, width: 2 });
    g.position.set(sprite.position.x, sprite.position.y);
  }

  function attachPivotDrag(g: Graphics, layerId: string) {
    g.on("pointerdown", (e: FederatedPointerEvent) => {
      const sprite = composeStateRef.current.sprites.get(layerId);
      const layer = findLayer(layerId);
      if (!sprite || !layer || !sprite.parent) return;
      const startParent = sprite.parent.toLocal(e.global);
      dragRef.current = {
        kind: "pivot",
        pointerId: e.pointerId,
        layerId,
        startParent: { x: startParent.x, y: startParent.y },
        startTranslation: { x: layer.rest.translation.x, y: layer.rest.translation.y },
        startPivot: { x: layer.pivot.x, y: layer.pivot.y },
        startScale: { x: sprite.scale.x, y: sprite.scale.y },
        startRotation: sprite.rotation,
      };
      e.stopPropagation();
    });

    const handleMove = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId || drag.kind !== "pivot") return;
      const sprite = composeStateRef.current.sprites.get(drag.layerId);
      const layer = findLayer(drag.layerId);
      if (!sprite || !layer || !sprite.parent) return;
      const cur = sprite.parent.toLocal(e.global);
      const dx = cur.x - drag.startParent.x;
      const dy = cur.y - drag.startParent.y;

      // Convert parent-space delta into image-local pixels by inverting
      // sprite rotation and scale captured at drag start. Keeps the visual
      // image stationary while the pivot point moves.
      const rot = drag.startRotation ?? 0;
      const sx = drag.startScale?.x || 1;
      const sy = drag.startScale?.y || 1;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const localDX = (dx * cos - dy * sin) / sx;
      const localDY = (dx * sin + dy * cos) / sy;

      useStore
        .getState()
        .setLayerPivot(
          drag.layerId,
          {
            x: (drag.startPivot?.x ?? 0) + localDX,
            y: (drag.startPivot?.y ?? 0) + localDY,
          },
          { x: dx, y: dy },
        );

      // Pin handle to the cursor while dragging.
      const localCursor = sprite.parent.toLocal(e.global, undefined, new Point());
      g.position.set(localCursor.x, localCursor.y);
    };

    const endPivot = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.pointerId === e.pointerId && drag.kind === "pivot") {
        dragRef.current = null;
      }
    };

    g.on("globalpointermove", handleMove);
    g.on("pointerup", endPivot);
    g.on("pointerupoutside", endPivot);
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-panel">
      <div ref={containerRef} className="border border-edge shadow-lg" />
    </div>
  );
}
