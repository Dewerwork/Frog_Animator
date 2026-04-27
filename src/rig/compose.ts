// Builds / updates a Pixi scene graph from a resolved pose.
//
// One Container per Character (the "root"), one Sprite per visible Layer
// parented either to that root or to another layer's container.
//
// Sprites are keyed by Layer.id and reused across redraws — never recreated
// — so drag handlers stay attached.

import { Container, Sprite, Texture } from "pixi.js";

import type { Layer, Project, TargetId } from "@/model/types";
import { getBuiltinTexture, isBuiltin } from "@/render/builtin";
import { getCached } from "@/render/textureCache";
import type { ResolvedPose } from "./resolve";

export interface SpriteHandle {
  sprite: Sprite;
  layer: Layer;
}

export interface ComposeState {
  /** Per-layer sprite, keyed by Layer.id. */
  sprites: Map<string, Sprite>;
  /** Per-character container, keyed by Character.id. */
  charRoots: Map<string, Container>;
}

export function createComposeState(): ComposeState {
  return { sprites: new Map(), charRoots: new Map() };
}

function resolveTexture(layer: Layer, variantId: string): Texture {
  const variant = layer.wardrobe.find((v) => v.id === variantId) ?? layer.wardrobe[0];
  if (!variant) return Texture.EMPTY;
  if (isBuiltin(variant.asset.assetId)) return getBuiltinTexture(variant.asset.assetId);
  return getCached(variant.asset) ?? Texture.EMPTY;
}

/**
 * Reconcile `state.sprites` / `state.charRoots` against `project` + `pose`,
 * mounting / unmounting children of `root` as needed.
 */
export function composeInto(
  root: Container,
  project: Project,
  pose: ResolvedPose,
  state: ComposeState,
  onSpriteCreated?: (handle: SpriteHandle) => void,
): void {
  const seenLayers = new Set<string>();
  const seenChars = new Set<string>();

  for (const character of project.scene.characters) {
    seenChars.add(character.id);
    let charRoot = state.charRoots.get(character.id);
    if (!charRoot) {
      charRoot = new Container();
      charRoot.label = `char:${character.id}`;
      state.charRoots.set(character.id, charRoot);
      root.addChild(charRoot);
    }

    const rootPose = pose[`${character.id}:root` as TargetId];
    if (rootPose) {
      charRoot.position.set(rootPose.translation.x, rootPose.translation.y);
      charRoot.rotation = rootPose.rotation;
      charRoot.scale.set(rootPose.scale.x, rootPose.scale.y);
      charRoot.visible = rootPose.visible;
    }

    for (const layer of character.layers) {
      seenLayers.add(layer.id);
      const lp = pose[layer.id as TargetId];
      if (!lp) continue;

      let sprite = state.sprites.get(layer.id);
      if (!sprite) {
        sprite = new Sprite(resolveTexture(layer, lp.variantId));
        sprite.label = `layer:${layer.id}`;
        sprite.eventMode = "static";
        sprite.cursor = "grab";
        state.sprites.set(layer.id, sprite);
        // Parented later this pass.
        if (onSpriteCreated) onSpriteCreated({ sprite, layer });
      } else {
        const tex = resolveTexture(layer, lp.variantId);
        if (sprite.texture !== tex) sprite.texture = tex;
      }

      // Anchor from image-local pivot. Texture is guaranteed valid here.
      const tw = sprite.texture.width || 1;
      const th = sprite.texture.height || 1;
      sprite.anchor.set(layer.pivot.x / tw, layer.pivot.y / th);

      sprite.position.set(lp.translation.x, lp.translation.y);
      sprite.rotation = lp.rotation;
      sprite.scale.set(lp.scale.x, lp.scale.y);
      sprite.visible = lp.visible;
      sprite.zIndex = lp.z;

      // Reparent to character root (M3 will support layer-to-layer parenting).
      const desiredParent = charRoot;
      if (sprite.parent !== desiredParent) desiredParent.addChild(sprite);
    }

    charRoot.sortableChildren = true;
  }

  // Unmount sprites for layers no longer in the project.
  for (const [layerId, sprite] of state.sprites) {
    if (!seenLayers.has(layerId)) {
      sprite.removeFromParent();
      sprite.destroy({ children: true });
      state.sprites.delete(layerId);
    }
  }
  for (const [charId, charRoot] of state.charRoots) {
    if (!seenChars.has(charId)) {
      charRoot.removeFromParent();
      charRoot.destroy({ children: true });
      state.charRoots.delete(charId);
    }
  }
}
