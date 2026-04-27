import { useEffect, useRef, useState } from "react";
import { Texture } from "pixi.js";

import type { Layer, TargetId, WardrobeVariant } from "@/model/types";
import { isBuiltin, getBuiltinTexture } from "@/render/builtin";
import { getCached } from "@/render/textureCache";
import { useStore } from "@/state/store";
import { resolvePoseCached } from "@/rig/resolve";
import { importAssetForActiveLayer } from "@/project/importAsset";

function useActiveLayer(): { layer: Layer; characterId: string } | null {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  if (!project) return null;
  const sel = selection.find((t) => typeof t === "string" && !t.includes(":"));
  for (const c of project.scene.characters) {
    if (sel) {
      const layer = c.layers.find((l) => l.id === sel);
      if (layer) return { layer, characterId: c.id };
    }
  }
  // Fallback: first layer of first character.
  const c = project.scene.characters[0];
  if (c?.layers[0]) return { layer: c.layers[0], characterId: c.id };
  return null;
}

export function Wardrobe() {
  const active = useActiveLayer();
  const project = useStore((s) => s.project);
  const currentFrameIndex = useStore((s) => s.currentFrameIndex);
  const editing = useStore((s) => s.editing);
  const mode = useStore((s) => s.mode);
  const stageEdit = useStore((s) => s.stageEdit);
  const setLayerDefaultVariant = useStore((s) => s.setLayerDefaultVariant);
  const renameWardrobeVariant = useStore((s) => s.renameWardrobeVariant);
  const deleteWardrobeVariant = useStore((s) => s.deleteWardrobeVariant);

  if (!active || !project) {
    return <div className="h-full bg-panel2 p-2 text-xs text-ink/60">Select a layer.</div>;
  }
  const { layer } = active;
  const inherited = resolvePoseCached(project, currentFrameIndex, useStore.getState().dirtyTick)[
    layer.id as TargetId
  ];
  const editVariant = editing.edits[layer.id as TargetId]?.variantId;
  const activeVariantId = editVariant ?? inherited?.variantId ?? layer.rest.defaultVariantId;

  const onPick = (vid: string) => {
    if (mode === "rig") {
      setLayerDefaultVariant(layer.id, vid);
    } else {
      stageEdit(layer.id as TargetId, { variantId: vid });
    }
  };

  return (
    <div className="flex h-full flex-col bg-panel2 text-xs">
      <div className="flex items-center justify-between border-b border-edge px-2 py-1">
        <span className="font-medium text-ink/80">Wardrobe — {layer.name}</span>
        <button
          onClick={() => void importAssetForActiveLayer()}
          className="rounded border border-edge px-2 py-0.5 text-ink/70 hover:text-ink"
          title="Import a PNG and add as new variant"
        >
          + PNG
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1 overflow-auto p-1">
        {layer.wardrobe.map((v) => (
          <VariantTile
            key={v.id}
            variant={v}
            active={v.id === activeVariantId}
            isRestDefault={v.id === layer.rest.defaultVariantId}
            onClick={() => onPick(v.id)}
            onRename={(name) => renameWardrobeVariant(layer.id, v.id, name)}
            onDelete={
              layer.wardrobe.length > 1
                ? () => {
                    if (confirm(`Delete variant "${v.name}"?`))
                      deleteWardrobeVariant(layer.id, v.id);
                  }
                : undefined
            }
          />
        ))}
      </div>
      <div className="px-2 pb-1 text-[10px] text-ink/50">
        {mode === "rig"
          ? "Rig mode: click sets the rest default."
          : "Animate mode: click stages a variant edit; press Space to capture."}
      </div>
    </div>
  );
}

function VariantTile(props: {
  variant: WardrobeVariant;
  active: boolean;
  isRestDefault: boolean;
  onClick: () => void;
  onRename: (n: string) => void;
  onDelete?: () => void;
}) {
  const { variant, active, isRestDefault, onClick, onRename, onDelete } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const tex: Texture = isBuiltin(variant.asset.assetId)
      ? getBuiltinTexture(variant.asset.assetId)
      : (getCached(variant.asset) ?? Texture.EMPTY);
    paintTextureToThumbnail(c, tex);
  }, [variant]);

  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer rounded border p-1 ${
        active ? "border-accent bg-accent/10" : "border-edge hover:border-ink/40"
      }`}
      title={`${variant.name} (${variant.asset.assetId}/${variant.asset.file})`}
    >
      <canvas ref={canvasRef} width={64} height={64} className="block bg-panel" />
      {editing ? (
        <input
          autoFocus
          defaultValue={variant.name}
          onBlur={(e) => {
            onRename(e.currentTarget.value || variant.name);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onRename(e.currentTarget.value || variant.name);
              setEditing(false);
            } else if (e.key === "Escape") {
              setEditing(false);
            }
          }}
          className="mt-1 w-full rounded border border-edge bg-panel px-1 text-[10px]"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="mt-1 truncate text-[10px] text-ink/80"
        >
          {variant.name}
          {isRestDefault ? <span className="ml-1 text-ink/40">★</span> : null}
        </div>
      )}
      {onDelete ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-0 top-0 hidden rounded bg-panel/80 px-1 text-ink/40 hover:text-red-300 group-hover:block"
          title="Delete variant"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function paintTextureToThumbnail(canvas: HTMLCanvasElement, tex: Texture) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#23232b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // tex.source.resource is the underlying HTMLCanvasElement / ImageBitmap / image.
  // For builtins these are HTMLCanvasElement; for imported PNGs Pixi creates an
  // ImageBitmap. Both are drawable on Canvas2D.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src: CanvasImageSource | undefined = (tex.source as any)?.resource;
  if (!src) return;
  const w = tex.frame?.width ?? canvas.width;
  const h = tex.frame?.height ?? canvas.height;
  const scale = Math.min(canvas.width / w, canvas.height / h);
  const drawW = w * scale;
  const drawH = h * scale;
  ctx.drawImage(src, (canvas.width - drawW) / 2, (canvas.height - drawH) / 2, drawW, drawH);
}
