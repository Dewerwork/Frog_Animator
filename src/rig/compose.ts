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
  /** Background sprite, if any. */
  bgSprite: Sprite | null;
  bgId: string | null;
}

export function createComposeState(): ComposeState {
  return { sprites: new Map(), charRoots: new Map(), bgSprite: null, bgId: null };
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

  // Sort root children by zIndex so backgrounds (negative z) sink under
  // character roots. Cheap when nothing changes — Pixi short-circuits.
  root.sortableChildren = true;

  // Background, if any. Always parented to root and held at zIndex −1000 so
  // it sits behind every character. Resolved pose may carry per-frame variant
  // / translation overrides; treated symmetrically with layers.
  const bg = project.scene.background;
  if (bg) {
    const bgPose = pose[`bg:${bg.id}` as TargetId];
    const variant = bg.variants.find((v) => v.id === bgPose?.variantId) ?? bg.variants[0];
    if (variant) {
      const tex = isBuiltin(variant.asset.assetId)
        ? getBuiltinTexture(variant.asset.assetId)
        : (getCached(variant.asset) ?? Texture.EMPTY);
      // Re-create if the active background id changed.
      if (state.bgId !== bg.id || !state.bgSprite) {
        if (state.bgSprite) {
          state.bgSprite.removeFromParent();
          state.bgSprite.destroy();
        }
        state.bgSprite = new Sprite(tex);
        state.bgSprite.label = `bg:${bg.id}`;
        state.bgSprite.eventMode = "none";
        state.bgId = bg.id;
        root.addChild(state.bgSprite);
      } else if (state.bgSprite.texture !== tex) {
        state.bgSprite.texture = tex;
      }
      const sp = state.bgSprite;
      // Backgrounds are anchored top-left so a bg image fills the canvas
      // naturally (translation defaults to (0,0)).
      sp.anchor.set(0, 0);
      sp.position.set(bgPose?.translation.x ?? 0, bgPose?.translation.y ?? 0);
      sp.rotation = bgPose?.rotation ?? 0;
      sp.scale.set(bgPose?.scale.x ?? 1, bgPose?.scale.y ?? 1);
      sp.visible = bgPose?.visible ?? true;
      sp.zIndex = bgPose?.z ?? -1000;
      if (sp.parent !== root) root.addChild(sp);
    }
  } else if (state.bgSprite) {
    state.bgSprite.removeFromParent();
    state.bgSprite.destroy();
    state.bgSprite = null;
    state.bgId = null;
  }

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

    // First pass: ensure a Sprite exists for every layer in this character so
    // children can find their parent in pass two.
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
        sprite.sortableChildren = true;
        state.sprites.set(layer.id, sprite);
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
    }

    // Second pass: parent each sprite to either its parent layer's sprite or
    // the character root. Cycles in `parent` are guarded against with a depth
    // budget — store actions also reject cycle-creating reparents.
    for (const layer of character.layers) {
      const sprite = state.sprites.get(layer.id);
      if (!sprite) continue;
      let desired: Container = charRoot;
      if (layer.parent) {
        const parentSprite = state.sprites.get(layer.parent);
        if (parentSprite) desired = parentSprite;
      }
      if (sprite.parent !== desired) desired.addChild(sprite);
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
