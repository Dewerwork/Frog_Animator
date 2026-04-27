import { useEffect, useRef } from "react";
import { Graphics, Point } from "pixi.js";
import type { FederatedPointerEvent, Sprite } from "pixi.js";

import { useStore } from "@/state/store";
import { createStage, type StageHandles } from "@/render/stage";
import { composeInto, createComposeState, type ComposeState } from "@/rig/compose";
import { resolvePose, resolvePoseCached } from "@/rig/resolve";
import {
  angleFromPivot,
  clampScale,
  clampTranslation,
  shortestArc,
} from "@/rig/dragMath";
import type { Layer, LayerConstraints, TargetId, Vec2 } from "@/model/types";

type DragKind = "translate" | "pivot" | "rotate" | "scale";
type ScaleCorner = "tl" | "tr" | "bl" | "br";

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
  /** For rotate: angle from pivot to cursor at drag start (parent-local). */
  startGripAngle?: number;
  /** For scale drags: which corner is being dragged. */
  scaleCorner?: ScaleCorner;
}

/** Distance (in parent-local pixels) of the rotation grip from the pivot. */
const ROTATION_GRIP_RADIUS = 60;

/** Half-extent of a scale corner from its bbox corner (visual size). */
const SCALE_GRIP_HALF = 5;

export function Stage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handlesRef = useRef<StageHandles | null>(null);
  const composeStateRef = useRef<ComposeState>(createComposeState());
  const onionStatesRef = useRef<Map<number, ComposeState>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const pivotHandleRef = useRef<Graphics | null>(null);
  const rotationHandleRef = useRef<Graphics | null>(null);
  const scaleHandlesRef = useRef<Map<ScaleCorner, Graphics>>(new Map());

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
      rotationHandleRef.current = null;
      scaleHandlesRef.current.clear();
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
    updateRigHandles();
  }

  function updateRigHandles() {
    updatePivotHandle();
    updateRotationHandle();
    updateScaleHandles();
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
      const raw: Vec2 = {
        x: drag.startTranslation.x + dx,
        y: drag.startTranslation.y + dy,
      };
      const next = clampTranslation(raw, layer.constraints?.translation);

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

  /** Find the active rigging target: first non-root, non-bg selection that
   *  resolves to a real layer with a mounted sprite. */
  function activeRigTarget(): {
    layer: Layer;
    sprite: Sprite;
    constraints: LayerConstraints | undefined;
  } | null {
    const s = useStore.getState();
    if (s.mode !== "rig" && !shouldShowAnimateHandles()) return null;
    if (s.selection.length === 0) return null;
    const layerId = s.selection.find((t) => !String(t).includes(":")) as string | undefined;
    if (!layerId) return null;
    const sprite = composeStateRef.current.sprites.get(layerId);
    const layer = findLayer(layerId);
    if (!sprite || !layer || !sprite.parent) return null;
    return { layer, sprite, constraints: layer.constraints };
  }

  /** Whether to show transform handles in animate mode too. We show them
   *  iff a layer is selected — the user can still drag the body sprite for
   *  translation. Rotation/scale only have UI when handles are visible. */
  function shouldShowAnimateHandles(): boolean {
    const s = useStore.getState();
    return s.selection.some((t) => !String(t).includes(":"));
  }

  // ── Rotation handle ─────────────────────────────────────────────────────
  function updateRotationHandle() {
    const target = activeRigTarget();
    if (!target) {
      if (rotationHandleRef.current) {
        rotationHandleRef.current.removeFromParent();
        rotationHandleRef.current.destroy();
        rotationHandleRef.current = null;
      }
      return;
    }
    const { sprite } = target;
    let g = rotationHandleRef.current;
    if (!g) {
      g = new Graphics();
      g.eventMode = "static";
      g.cursor = "ew-resize";
      g.zIndex = 99998;
      rotationHandleRef.current = g;
      attachRotationDrag(g);
    }
    if (g.parent !== sprite.parent) sprite.parent!.addChild(g);

    // Place the grip at sprite.position + R(sprite.rotation) * (radius, 0).
    // That puts it on the layer's local +X axis at a constant parent-space
    // distance from the pivot, which keeps it visually stable across scales.
    const cos = Math.cos(sprite.rotation);
    const sin = Math.sin(sprite.rotation);
    const gx = sprite.position.x + cos * ROTATION_GRIP_RADIUS;
    const gy = sprite.position.y + sin * ROTATION_GRIP_RADIUS;

    g.clear();
    // A small line from pivot to grip + the grip dot itself.
    g.moveTo(sprite.position.x, sprite.position.y).lineTo(gx, gy).stroke({
      color: 0x66ccff,
      width: 2,
      alpha: 0.7,
    });
    g.circle(gx, gy, 7).fill({ color: 0x66ccff, alpha: 0.85 }).stroke({ color: 0x222222, width: 2 });
  }

  function attachRotationDrag(g: Graphics) {
    g.on("pointerdown", (e: FederatedPointerEvent) => {
      const target = activeRigTarget();
      if (!target) return;
      const { sprite, layer } = target;
      const startParent = sprite.parent!.toLocal(e.global);
      const pivotParent: Vec2 = { x: sprite.position.x, y: sprite.position.y };
      const startGripAngle = angleFromPivot(pivotParent, startParent);
      dragRef.current = {
        kind: "rotate",
        pointerId: e.pointerId,
        layerId: layer.id,
        startParent: { x: startParent.x, y: startParent.y },
        startTranslation: { x: layer.rest.translation.x, y: layer.rest.translation.y },
        startRotation: sprite.rotation,
        startGripAngle,
      };
      e.stopPropagation();
    });

    const handleMove = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId || drag.kind !== "rotate") return;
      const sprite = composeStateRef.current.sprites.get(drag.layerId);
      const layer = findLayer(drag.layerId);
      if (!sprite || !layer || !sprite.parent) return;

      const pivotParent: Vec2 = { x: sprite.position.x, y: sprite.position.y };
      const cur = sprite.parent.toLocal(e.global);
      const cursorAngle = angleFromPivot(pivotParent, cur);
      const arc = shortestArc(cursorAngle - (drag.startGripAngle ?? 0));
      let next = (drag.startRotation ?? 0) + arc;
      if (layer.constraints?.rotation) {
        next = Math.min(layer.constraints.rotation.max, Math.max(layer.constraints.rotation.min, next));
      }

      const s = useStore.getState();
      if (s.mode === "rig") {
        s.setLayerRestRotation(drag.layerId, next);
      } else {
        s.stageEdit(drag.layerId as TargetId, { rotation: next });
      }
    };

    const endRotate = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.pointerId === e.pointerId && drag.kind === "rotate") {
        dragRef.current = null;
      }
    };

    g.on("globalpointermove", handleMove);
    g.on("pointerup", endRotate);
    g.on("pointerupoutside", endRotate);
  }

  // ── Scale handles (4 corners) ───────────────────────────────────────────
  function updateScaleHandles() {
    const target = activeRigTarget();
    const corners: ScaleCorner[] = ["tl", "tr", "bl", "br"];
    if (!target) {
      for (const k of corners) {
        const g = scaleHandlesRef.current.get(k);
        if (g) {
          g.removeFromParent();
          g.destroy();
          scaleHandlesRef.current.delete(k);
        }
      }
      return;
    }
    const { sprite } = target;

    // Bounds in sprite-local space (texture rect minus anchor offset).
    const tw = sprite.texture.width || 1;
    const th = sprite.texture.height || 1;
    const ax = sprite.anchor.x;
    const ay = sprite.anchor.y;
    const localCorners: Record<ScaleCorner, Vec2> = {
      tl: { x: -ax * tw, y: -ay * th },
      tr: { x: (1 - ax) * tw, y: -ay * th },
      bl: { x: -ax * tw, y: (1 - ay) * th },
      br: { x: (1 - ax) * tw, y: (1 - ay) * th },
    };

    const cos = Math.cos(sprite.rotation);
    const sin = Math.sin(sprite.rotation);
    for (const k of corners) {
      let g = scaleHandlesRef.current.get(k);
      if (!g) {
        g = new Graphics();
        g.eventMode = "static";
        g.cursor = "nwse-resize";
        g.zIndex = 99997;
        scaleHandlesRef.current.set(k, g);
        attachScaleDrag(g, k);
      }
      if (g.parent !== sprite.parent) sprite.parent!.addChild(g);

      const lc = localCorners[k];
      // sprite-local → parent-local: scale, rotate, translate.
      const sxv = lc.x * sprite.scale.x;
      const syv = lc.y * sprite.scale.y;
      const px = sprite.position.x + cos * sxv - sin * syv;
      const py = sprite.position.y + sin * sxv + cos * syv;

      g.clear();
      g.rect(px - SCALE_GRIP_HALF, py - SCALE_GRIP_HALF, SCALE_GRIP_HALF * 2, SCALE_GRIP_HALF * 2)
        .fill({ color: 0xddee55, alpha: 0.9 })
        .stroke({ color: 0x222222, width: 1 });
    }
  }

  function attachScaleDrag(g: Graphics, corner: ScaleCorner) {
    g.on("pointerdown", (e: FederatedPointerEvent) => {
      const target = activeRigTarget();
      if (!target) return;
      const { sprite, layer } = target;
      const startParent = sprite.parent!.toLocal(e.global);
      dragRef.current = {
        kind: "scale",
        pointerId: e.pointerId,
        layerId: layer.id,
        startParent: { x: startParent.x, y: startParent.y },
        startTranslation: { x: layer.rest.translation.x, y: layer.rest.translation.y },
        startScale: { x: sprite.scale.x, y: sprite.scale.y },
        startRotation: sprite.rotation,
        scaleCorner: corner,
      };
      e.stopPropagation();
    });

    const handleMove = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId || drag.kind !== "scale") return;
      const sprite = composeStateRef.current.sprites.get(drag.layerId);
      const layer = findLayer(drag.layerId);
      if (!sprite || !layer || !sprite.parent) return;

      // Convert pointer delta from parent-local into sprite-local pixels by
      // inverting the sprite's start rotation. The corner sign tells us
      // which axis grows in which direction when the cursor moves outward.
      const cur = sprite.parent.toLocal(e.global);
      const dx = cur.x - drag.startParent.x;
      const dy = cur.y - drag.startParent.y;
      const rot = drag.startRotation ?? 0;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const localDX = dx * cos - dy * sin;
      const localDY = dx * sin + dy * cos;

      // Sign factors per corner: +1 if dragging this corner outward from
      // the pivot along that axis grows the sprite; −1 otherwise.
      const xSign = drag.scaleCorner === "tr" || drag.scaleCorner === "br" ? 1 : -1;
      const ySign = drag.scaleCorner === "bl" || drag.scaleCorner === "br" ? 1 : -1;

      // Each corner's distance from pivot (pre-scale) in sprite-local pixels.
      // We use the texture half-extent on each side to pick a sensible delta.
      const tw = sprite.texture.width || 1;
      const th = sprite.texture.height || 1;
      const ax = sprite.anchor.x;
      const ay = sprite.anchor.y;
      const halfW = xSign > 0 ? (1 - ax) * tw : ax * tw;
      const halfH = ySign > 0 ? (1 - ay) * th : ay * th;

      const ratioX = (halfW + xSign * localDX) / Math.max(1, halfW);
      const ratioY = (halfH + ySign * localDY) / Math.max(1, halfH);

      const raw: Vec2 = {
        x: (drag.startScale?.x ?? 1) * ratioX,
        y: (drag.startScale?.y ?? 1) * ratioY,
      };
      const next = clampScale(raw, layer.constraints?.scale);

      const s = useStore.getState();
      if (s.mode === "rig") {
        s.setLayerRestScale(drag.layerId, next);
      } else {
        s.stageEdit(drag.layerId as TargetId, { scale: next });
      }
    };

    const endScale = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.pointerId === e.pointerId && drag.kind === "scale") {
        dragRef.current = null;
      }
    };

    g.on("globalpointermove", handleMove);
    g.on("pointerup", endScale);
    g.on("pointerupoutside", endScale);
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-panel">
      <div ref={containerRef} className="border border-edge shadow-lg" />
    </div>
  );
}
