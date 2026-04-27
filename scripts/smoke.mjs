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
const frameLabel0 = await page.locator("text=/\\d+ \\/ \\d+/").first().textContent();
if (!/^1 \/ 1$/.test(frameLabel0?.trim() ?? "")) {
  throw new Error(`expected "1 / 1", got "${frameLabel0}"`);
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
const frameLabel1 = await page.locator("text=/\\d+ \\/ \\d+/").first().textContent();
if (!/^2 \/ 2$/.test(frameLabel1?.trim() ?? "")) {
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
const at0 = await page.locator("text=/\\d+ \\/ \\d+/").first().textContent();
if (!/^1 \/ 2$/.test(at0?.trim() ?? "")) throw new Error(`scrub back failed, got "${at0}"`);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(20);

// 8) "B" inserts a blank frame.
await page.keyboard.press("KeyB");
await page.waitForTimeout(20);
const at2 = await page.locator("text=/\\d+ \\/ \\d+/").first().textContent();
if (!/^3 \/ 3$/.test(at2?.trim() ?? "")) throw new Error(`insert blank failed, got "${at2}"`);

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

if (errs.length) {
  throw new Error("page produced errors:\n" + errs.join("\n"));
}

console.log("Smoke test passed.");
console.log("  Drag staged:", JSON.stringify(stagedAfterDrag));
console.log("  Captured delta:", JSON.stringify(layerDelta));
console.log(`  Round-trip: ${json1.length} bytes, stable across re-serialize`);
console.log(`  Hierarchy: parent +100x → child world dx=${dxEye.toFixed(1)}`);

await browser.close();
server.close();
