/**
 * Walk-up test for dock stairs: collision rails + ramp eye height.
 * Usage: node scripts/playtest-stairs.mjs
 */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join } from "path";
import { fileURLToPath } from "url";
import { DOCK_STAIRS } from "../js/dock-layout.js";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const PORT = 4175;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
        let filePath = join(root, decodeURIComponent(url.pathname));
        if (url.pathname === "/" || url.pathname === "") filePath = join(root, "index.html");
        const data = await readFile(filePath);
        res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

const issues = [];
const passes = [];

function pass(name) {
  passes.push(name);
  console.log("ok:", name);
}

function fail(name, detail) {
  issues.push({ name, detail });
  console.error("FAIL:", name, detail);
}

const server = await startServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  await page.goto(`http://127.0.0.1:${PORT}/?playtest=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => document.getElementById("asset-loading")?.classList.contains("hidden"),
    { timeout: 120000 }
  );
  await page.waitForFunction(() => window.__playtest?.walk, { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Start on mid boardwalk, then walk toward shore (+Z).
  await page.evaluate(() => {
    window.__setPlaytestCamera(0, 2.5, 8, 0, 2.5, 16);
  });
  await page.evaluate(() => window.__playtest.waitFrames(20));

  const boardStart = await page.evaluate(() => window.__playtest.getStairsInfo());
  if (boardStart.eyeY > 2.4) pass("boardwalk eye height on pier deck");
  else fail("boardwalk eye height on pier deck", JSON.stringify(boardStart));

  await page.evaluate(() => {
    window.__setPlaytestCamera(0, 2.5, 12, 0, 2.5, 18);
  });
  await page.evaluate(() => window.__playtest.waitFrames(10));

  await page.screenshot({ path: "/opt/cursor/artifacts/stairs-before.png" });

  const trace = await page.evaluate(() => window.__playtest.walk(0, 1, 2.8));
  await page.evaluate(() => window.__playtest.waitFrames(15));
  await page.screenshot({ path: "/opt/cursor/artifacts/stairs-after.png" });

  const after = await page.evaluate(() => window.__playtest.getStairsInfo());
  const onStairsSamples = trace.filter((p) => p.onStairs);
  const yRise = trace.length > 1 ? trace[trace.length - 1].y - trace[0].y : 0;
  const zGain = trace.length > 1 ? trace[trace.length - 1].z - trace[0].z : 0;

  if (zGain > 2.5) pass(`walked up boardwalk (+${zGain.toFixed(2)}m Z)`);
  else fail("walked up boardwalk", `zGain=${zGain.toFixed(2)}`);

  if (onStairsSamples.length >= 8) pass(`on stairs for ${onStairsSamples.length} steps`);
  else fail("on stairs duration", `samples=${onStairsSamples.length}`);

  const stairYs = onStairsSamples.map((p) => p.y);
  const stairRise = stairYs.length > 1 ? stairYs[stairYs.length - 1] - stairYs[0] : 0;
  if (Math.abs(stairRise) > 0.25) {
    pass(`eye height tracks ramp (${stairRise > 0 ? "+" : ""}${stairRise.toFixed(2)}m)`);
  } else {
    fail("eye height tracks ramp", `delta=${stairRise.toFixed(2)}`);
  }

  if (Math.abs(after.camera.x) < 0.55) {
    pass("stayed centered on stairs");
  } else {
    fail("stayed centered on stairs", `x=${after.camera.x.toFixed(2)}`);
  }

  if (after.camera.z >= DOCK_STAIRS.maxZ - 0.2) pass("reached top of stairs");
  else fail("reached top of stairs", `z=${after.camera.z.toFixed(2)}`);

  // Side cut-through should be blocked.
  await page.evaluate(() => {
    window.__setPlaytestCamera(-1.1, 1.6, 14, -2, 1.6, 14);
  });
  const sideTrace = await page.evaluate(() => window.__playtest.walk(-1, 0, 0.6));
  const maxLeft = Math.min(...sideTrace.map((p) => p.x));
  if (maxLeft >= -0.48 - 0.52) {
    pass("stairs side rail blocks cut-through");
  } else {
    fail("stairs side rail blocks cut-through", `minX=${maxLeft.toFixed(2)}`);
  }

  console.log("\n=== STAIR WALK PLAYTEST ===");
  console.log("Passed:", passes.length);
  console.log("Failed:", issues.length);
  if (issues.length) {
    for (const i of issues) console.log(` - ${i.name}: ${i.detail}`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error("PLAYTEST CRASH:", err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
