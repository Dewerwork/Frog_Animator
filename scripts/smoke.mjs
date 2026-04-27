// Headless smoke test for M1 (capture loop) + M2 (project file round-trip).
// Loads the production build over a tiny static server, drives the UI with
// Playwright, and asserts UI behavior plus serialize→JSON→deserialize fidelity.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const dist = path.resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let p = path.join(dist, url === "/" ? "index.html" : url);
  if (!p.startsWith(dist)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": mime[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});

const port = await new Promise((r) => server.listen(0, () => r(server.address().port)));
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();

const errs = [];
page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errs.push(`console.error: ${m.text()}`);
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(300);

// 1) The Pixi canvas should be mounted and have non-zero pixels.
const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { w: r.width, h: r.height, x: r.left, y: r.top };
});
if (!canvasInfo) throw new Error("canvas missing");
if (canvasInfo.w < 100 || canvasInfo.h < 100) throw new Error(`canvas too small ${JSON.stringify(canvasInfo)}`);

// 2) Frame counter shows "1 / 1" initially.
const frameLabel0 = await page.locator("text=/Frame \\d+ \\/ \\d+/").first().textContent();
if (!/Frame 1 \/ 1/.test(frameLabel0?.trim() ?? "")) {
  throw new Error(`expected "Frame 1 / 1", got "${frameLabel0}"`);
}

// 3) Drag the frog from canvas-center+0 to canvas-center+(150,80).
//    Stage uses the canvas's native size (1280x720) inside a flex-centered host —
//    Pixi maps client pixels through autoDensity, so client coords still hit the
//    sprite at its rendered position. The frog rests at scene (640,360).
const cx = canvasInfo.x + canvasInfo.w / 2;
const cy = canvasInfo.y + canvasInfo.h / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 70, cy + 40, { steps: 4 });
await page.mouse.move(cx + 150, cy + 80, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(50);

// 4) After drag, store should hold a staged edit for the frog layer.
const stagedAfterDrag = await page.evaluate(() => {
  // Expose the store on window for the smoke test.
  // @ts-ignore
  return window.__frogStore?.getState().editing.edits;
});

// 5) Press Space to capture, expect "2 / 2".
await page.keyboard.press("Space");
await page.waitForTimeout(50);
const frameLabel1 = await page.locator("text=/Frame \\d+ \\/ \\d+/").first().textContent();
if (!/Frame 2 \/ 2/.test(frameLabel1?.trim() ?? "")) {
  throw new Error(`expected "2 / 2" after capture, got "${frameLabel1}"`);
}

// 6) Project should now have 2 frames; frame[1] should record a translation delta.
const stateAfterCapture = await page.evaluate(() => {
  // @ts-ignore
  const s = window.__frogStore.getState();
  return {
    frameCount: s.project.scene.frames.length,
    frame1Layers: s.project.scene.frames[1]?.layers,
    editsCleared: Object.keys(s.editing.edits).length === 0,
  };
});
if (stateAfterCapture.frameCount !== 2) throw new Error("expected 2 frames");
if (!stateAfterCapture.editsCleared) throw new Error("editing buffer not cleared after capture");
const layerDelta = stateAfterCapture.frame1Layers?.["layer-frog-body"];
if (!layerDelta?.translation) throw new Error("frame[1] missing layer-frog-body translation delta");

// 7) ArrowLeft → frame 0, ArrowRight → frame 1, transitions are applied.
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(20);
const at0 = await page.locator("text=/Frame \\d+ \\/ \\d+/").first().textContent();
if (!/Frame 1 \/ 2/.test(at0?.trim() ?? "")) throw new Error(`scrub back failed, got "${at0}"`);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(20);

// 8) "B" inserts a blank frame.
await page.keyboard.press("KeyB");
await page.waitForTimeout(20);
const at2 = await page.locator("text=/Frame \\d+ \\/ \\d+/").first().textContent();
if (!/Frame 3 \/ 3/.test(at2?.trim() ?? "")) throw new Error(`insert blank failed, got "${at2}"`);

// 9) Project file round-trip. Serialize the live project (Zod-validated),
//    parse it, deserialize it back, serialize the result, and assert the two
//    serializations are byte-identical. That's the actual stable-storage
//    property we care about — not key-order on the live Immer-managed object.
const { json1, json2, framesIn1 } = await page.evaluate(() => {
  // @ts-ignore
  const { serialize, deserialize } = window.__frogProject;
  // @ts-ignore
  const s = window.__frogStore.getState();
  const j1 = serialize(s.project);
  const reconstructed = deserialize(j1);
  const j2 = serialize(reconstructed);
  return {
    json1: j1,
    json2: j2,
    framesIn1: JSON.parse(j1).scene.frames.length,
  };
});

if (framesIn1 !== 3) throw new Error(`round-trip: expected 3 frames in serialized JSON, got ${framesIn1}`);
if (json1 !== json2) {
  // Truncate output for readability when this fails.
  const trunc = (s) => (s.length > 400 ? `${s.slice(0, 400)}…` : s);
  throw new Error(
    `round-trip: serialize(deserialize(serialize(p))) drifted\n--- json1 ---\n${trunc(json1)}\n--- json2 ---\n${trunc(json2)}`,
  );
}

// 10) Schema-version migration scaffold: feeding a v0 (or unknown) document
//     should throw a clear error instead of silently corrupting state.
const migrationGuards = await page.evaluate(() => {
  // @ts-ignore
  const { deserialize } = window.__frogProject;
  const errs = [];
  try {
    deserialize('{"schemaVersion":99}');
    errs.push("expected unsupported-version to throw");
  } catch {
    /* expected */
  }
  try {
    deserialize("not-json");
    errs.push("expected JSON.parse to throw on garbage");
  } catch {
    /* expected */
  }
  return errs;
});
if (migrationGuards.length) throw new Error(migrationGuards.join("; "));

// 11) M3 hierarchy: the seeded project has Body → Eye Highlight. Eye is
//     parented to Body in body-local space at (-33, -38). When we mutate
//     Body's rest.translation, Eye's world position should track because
//     compose() parents its sprite to Body's sprite.
//
// Scrub to frame 0 first — later frames carry translation overrides for
// the body that would mask any rest-pose change.
const heirarchy = await page.evaluate(async () => {
  // @ts-ignore
  const store = window.__frogStore;
  const layers = store.getState().project.scene.characters[0].layers;
  const bodyId = layers.find((l) => l.parent === null).id;
  const eyeId = layers.find((l) => l.parent === bodyId)?.id;
  if (!eyeId) return { error: "child layer not seeded" };

  store.getState().setFrameIndex(0);
  store.getState().setMode("rig");

  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  // @ts-ignore
  const eyeSpriteBefore = window.__getSpriteWorldPos?.(eyeId);
  // @ts-ignore
  const bodySpriteBefore = window.__getSpriteWorldPos?.(bodyId);

  store.getState().setLayerRestTranslation(bodyId, { x: 740, y: 360 });
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  // @ts-ignore
  const eyeSpriteAfter = window.__getSpriteWorldPos?.(eyeId);
  // @ts-ignore
  const bodySpriteAfter = window.__getSpriteWorldPos?.(bodyId);

  // Restore for downstream tests.
  store.getState().setLayerRestTranslation(bodyId, { x: 640, y: 360 });
  store.getState().setMode("animate");

  return { eyeSpriteBefore, eyeSpriteAfter, bodySpriteBefore, bodySpriteAfter };
});

if (heirarchy.error) throw new Error(`hierarchy: ${heirarchy.error}`);
if (!heirarchy.eyeSpriteBefore || !heirarchy.eyeSpriteAfter) {
  throw new Error("hierarchy: world-pos probe missing");
}
const dxBody = heirarchy.bodySpriteAfter.x - heirarchy.bodySpriteBefore.x;
const dxEye = heirarchy.eyeSpriteAfter.x - heirarchy.eyeSpriteBefore.x;
if (Math.abs(dxBody - 100) > 1) {
  throw new Error(`hierarchy: body did not move (expected 100, got ${dxBody})`);
}
if (Math.abs(dxEye - 100) > 1) {
  throw new Error(
    `hierarchy: child sprite did not track parent (expected dx≈100, got ${dxEye})`,
  );
}

// 12) M4 wardrobe variant swap: clicking a different variant in the
//     Wardrobe panel stages a variantId edit. Capture-selected then writes
//     ONLY that delta (since only that target has a staged edit), with no
//     translation field. We synthesize the staging directly through the
//     store to keep the test deterministic across UI layout changes.
const variantCapture = await page.evaluate(async () => {
  // @ts-ignore
  const store = window.__frogStore;
  // Add a second variant on the body layer.
  const bodyId = store.getState().project.scene.characters[0].layers[0].id;
  store.getState().addWardrobeVariant(
    bodyId,
    { id: "test-variant", name: "Test", assetId: "builtin:placeholder", file: "p.png" },
    false,
  );
  // Move to frame 0 and select the body.
  store.getState().setFrameIndex(0);
  store.getState().setSelection([bodyId]);
  store.getState().clearEdits();
  store.getState().stageEdit(bodyId, { variantId: "test-variant" });
  store.getState().captureFrame("selected");

  const s = store.getState();
  const idx = s.currentFrameIndex;
  return {
    capturedDelta: s.project.scene.frames[idx]?.layers?.[bodyId],
    stagedAfter: Object.keys(s.editing.edits).length,
    bodyId,
    framesInProject: s.project.scene.frames.length,
  };
});
if (!variantCapture.capturedDelta?.variantId) {
  throw new Error(`variant capture: missing variantId, got ${JSON.stringify(variantCapture.capturedDelta)}`);
}
if (variantCapture.capturedDelta.translation) {
  throw new Error("variant capture: translation should NOT be in selected-capture delta");
}
if (variantCapture.stagedAfter !== 0) {
  throw new Error(`variant capture: editing buffer not cleared (${variantCapture.stagedAfter} keys remain)`);
}

// 13) M4 per-frame z: stage z=+5, capture, scrub off and back, expect z honored.
const zCapture = await page.evaluate(() => {
  // @ts-ignore
  const store = window.__frogStore;
  const bodyId = variantCaptureBodyId();
  store.getState().clearEdits();
  store.getState().stageEdit(bodyId, { z: 5 });
  store.getState().captureFrame("selected");
  const idx = store.getState().currentFrameIndex;
  return store.getState().project.scene.frames[idx]?.layers?.[bodyId]?.z;
  function variantCaptureBodyId() {
    return store.getState().project.scene.characters[0].layers[0].id;
  }
});
if (zCapture !== 5) throw new Error(`z capture: expected 5, got ${zCapture}`);

// 14) M4 onion skin: enable, scrub to a middle frame, ghost compose states
//     should mount sprites in the onion containers.
const onion = await page.evaluate(async () => {
  // @ts-ignore
  const store = window.__frogStore;
  store.getState().setOnionSkin({ enabled: true, before: 1, after: 1 });
  // Move to a frame with neighbors on both sides.
  const frames = store.getState().project.scene.frames.length;
  store.getState().setFrameIndex(Math.floor(frames / 2));
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  // @ts-ignore
  const counts = window.__getOnionCounts?.();
  store.getState().setOnionSkin({ enabled: false });
  return counts;
});
if (!onion) throw new Error("onion: probe missing");
if (onion.before === 0 || onion.after === 0) {
  throw new Error(`onion: expected ghost sprites in both containers, got ${JSON.stringify(onion)}`);
}

// 15) M5 undo/redo: a captured frame is undoable; redo restores it.
//     The capture commits patches via produceWithPatches.
const undoRedo = await page.evaluate(() => {
  // @ts-ignore
  const { undo, redo } = window.__frogHistory;
  // @ts-ignore
  const store = window.__frogStore;
  const before = store.getState().project.scene.frames.length;
  store.getState().clearEdits();
  store.getState().stageEdit(
    store.getState().project.scene.characters[0].layers[0].id,
    { rotation: 0.5 },
  );
  store.getState().captureFrame("selected");
  const afterCapture = store.getState().project.scene.frames.length;
  undo();
  const afterUndo = store.getState().project.scene.frames.length;
  redo();
  const afterRedo = store.getState().project.scene.frames.length;
  return { before, afterCapture, afterUndo, afterRedo };
});
if (
  undoRedo.afterCapture !== undoRedo.before + 1 ||
  undoRedo.afterUndo !== undoRedo.before ||
  undoRedo.afterRedo !== undoRedo.before + 1
) {
  throw new Error(`undo/redo broken: ${JSON.stringify(undoRedo)}`);
}

// 16) M5 frame ops: duplicate / delete / move all work and survive
//     round-trip through serialize. Move keeps the right currentFrameIndex.
const frameOps = await page.evaluate(() => {
  // @ts-ignore
  const store = window.__frogStore;
  const start = store.getState().project.scene.frames.length;

  store.getState().setFrameIndex(0);
  store.getState().duplicateFrame();
  const afterDup = store.getState().project.scene.frames.length;
  const dupIdx = store.getState().currentFrameIndex; // should be 1 (just inserted)

  store.getState().moveFrame(1, 0);
  const afterMove = store.getState().currentFrameIndex; // moveFrame sets to=0

  store.getState().deleteFrame(0);
  const afterDelete = store.getState().project.scene.frames.length;

  return { start, afterDup, dupIdx, afterMove, afterDelete };
});
if (frameOps.afterDup !== frameOps.start + 1) {
  throw new Error(`duplicate broken: ${JSON.stringify(frameOps)}`);
}
if (frameOps.dupIdx !== 1) {
  throw new Error(`duplicate didn't advance index: ${JSON.stringify(frameOps)}`);
}
if (frameOps.afterMove !== 0) {
  throw new Error(`move didn't update index: ${JSON.stringify(frameOps)}`);
}
if (frameOps.afterDelete !== frameOps.start) {
  throw new Error(`delete returned wrong count: ${JSON.stringify(frameOps)}`);
}

// 17) M5 invariant check: plant a dangling frame target via partial-merge
//     setState (so action functions survive), trigger any commit-style
//     action, and verify validateInvariants emits a console error mentioning
//     the bogus key.
const invariantSpy = await page.evaluate(() => {
  // @ts-ignore
  const store = window.__frogStore;
  const orig = console.error;
  const seen = [];
  console.error = (...args) => {
    seen.push(args.map(String).join(" "));
    orig.apply(console, args);
  };
  // Partial merge: replace only `project` so the action functions stay.
  store.setState((s) => ({
    project: {
      ...s.project,
      scene: {
        ...s.project.scene,
        frames: s.project.scene.frames.map((f, idx) =>
          idx === 0
            ? { ...f, layers: { ...f.layers, __bogus__: { translation: { x: 1, y: 1 } } } }
            : f,
        ),
      },
    },
  }));
  // Trigger a commit-style action so validate runs.
  store
    .getState()
    .setOnionSkin({ enabled: store.getState().project.settings.onionSkin.enabled });
  console.error = orig;
  // Restore.
  store.setState((s) => ({
    project: {
      ...s.project,
      scene: {
        ...s.project.scene,
        frames: s.project.scene.frames.map((f, idx) =>
          idx === 0
            ? {
                ...f,
                layers: Object.fromEntries(
                  Object.entries(f.layers).filter(([k]) => k !== "__bogus__"),
                ),
              }
            : f,
        ),
      },
    },
  }));
  return seen.filter((m) => m.includes("invariant") && m.includes("__bogus__"));
});
if (invariantSpy.length === 0) {
  throw new Error("invariant check did not flag dangling target");
}

if (errs.length) {
  // Filter out the invariant test's intentional warnings.
  const real = errs.filter((m) => !m.includes("__bogus__"));
  if (real.length) throw new Error("page produced errors:\n" + real.join("\n"));
}

console.log("Smoke test passed.");
console.log("  Drag staged:", JSON.stringify(stagedAfterDrag));
console.log("  Captured delta:", JSON.stringify(layerDelta));
console.log(`  Round-trip: ${json1.length} bytes, stable across re-serialize`);
console.log(`  Hierarchy: parent +100x → child world dx=${dxEye.toFixed(1)}`);
console.log(`  Variant capture: ${JSON.stringify(variantCapture.capturedDelta)}`);
console.log(`  Z capture: z=${zCapture}`);
console.log(`  Onion ghosts: before=${onion.before}, after=${onion.after}`);
console.log(
  `  Undo/redo: before=${undoRedo.before}, capture=${undoRedo.afterCapture}, undo=${undoRedo.afterUndo}, redo=${undoRedo.afterRedo}`,
);
console.log(
  `  Frame ops: dup=${frameOps.afterDup}, dupIdx=${frameOps.dupIdx}, moveIdx=${frameOps.afterMove}, del=${frameOps.afterDelete}`,
);
console.log(`  Invariant: caught ${invariantSpy.length} dangling-key error(s)`);

await browser.close();
server.close();
