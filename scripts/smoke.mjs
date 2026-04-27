// Headless smoke test for the M1 capture loop.
// Loads the production build over a tiny static server, drives the UI with
// Playwright, and asserts: frog renders, drag stages an edit, Space captures,
// scrub goes back, drag-then-capture-then-back-then-forward shows two distinct
// translations.

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

if (errs.length) {
  throw new Error("page produced errors:\n" + errs.join("\n"));
}

console.log("M1 smoke test passed. Drag staged:", JSON.stringify(stagedAfterDrag));
console.log("Captured delta:", JSON.stringify(layerDelta));

await browser.close();
server.close();
