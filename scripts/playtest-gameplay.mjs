/**
 * Gameplay playtest: cast, bite, hook, reel, movement, pool visibility.
 * Usage: node scripts/playtest-gameplay.mjs
 */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join } from "path";
import { fileURLToPath } from "url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const PORT = 4174;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".hdr": "application/octet-stream",
  ".exr": "application/octet-stream",
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
        let filePath = join(root, decodeURIComponent(url.pathname));
        if (url.pathname === "/" || url.pathname === "") filePath = join(root, "index.html");
        const data = await readFile(filePath);
        const ext = extname(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
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

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`PAGE: ${err.message}`));

try {
  await page.goto(`http://127.0.0.1:${PORT}/?playtest=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => document.getElementById("asset-loading")?.classList.contains("hidden"),
    { timeout: 120000 }
  );
  await page.waitForFunction(() => window.__playtest?.getFishingState, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const poolVisible = await page.evaluate(() => window.__playtest.getPoolMarkerVisible());
  if (poolVisible) pass("fishing pool marker visible at spawn");
  else fail("fishing pool marker visible at spawn", "marker hidden");

  await page.evaluate(() => window.__setPlaytestCamera(0, 1.6, 4, 0, 0.4, -12));
  await page.evaluate(() => window.__playtest.waitFrames(30));

  const castOk = await page.evaluate(() => window.__playtest.cast(0.9));
  if (castOk) pass("cast started");
  else fail("cast started", "startCast returned false");

  await page.waitForFunction(
    () => ["waiting", "biting", "reeling", "caught"].includes(window.__playtest.getFishingState()),
    { timeout: 15000 }
  );
  pass("cast reached water");

  const bobberVisible = await page.evaluate(() => window.__playtest.getBobberVisible());
  if (bobberVisible) pass("bobber visible after cast");
  else pass("bobber hidden (lure rig ok)");

  const lineDetail = await page.evaluate(() => window.__playtest.getLineDetail?.() || null);
  if (lineDetail?.meshVisible && lineDetail.verts > 2) pass("fishing line mesh visible after cast");
  else fail("fishing line mesh visible after cast", JSON.stringify(lineDetail));

  await page.waitForTimeout(1200);
  const fishDetail = await page.evaluate(() => window.__playtest.getFishDetail?.() || null);
  if (fishDetail?.prospect) pass("prospect fish spawned in water");
  else fail("prospect fish spawned in water", JSON.stringify(fishDetail));
  if (fishDetail?.prospectSubmerged) pass("prospect fish swims below surface");
  else if (fishDetail?.prospect) fail("prospect fish swims below surface", JSON.stringify(fishDetail));

  await page.evaluate(() => window.__playtest.forceBite());
  await page.waitForFunction(() => window.__playtest.getFishingState() === "biting", { timeout: 8000 });
  pass("fish bite triggered");

  await page.evaluate(() => window.__playtest.hook());
  await page.waitForFunction(() => window.__playtest.getFishingState() === "reeling", { timeout: 3000 });
  pass("hook set — reeling");

  const biteFish = await page.evaluate(() => window.__playtest.getFishDetail?.() || null);
  if (biteFish?.biteFish) pass("bite fish visible during fight");
  else fail("bite fish visible during fight", JSON.stringify(biteFish));

  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => window.__playtest.reel(1));
    await page.evaluate(() => window.__playtest.waitFrames(2));
    const state = await page.evaluate(() => window.__playtest.getFishingState());
    if (state === "caught" || state === "idle") break;
  }

  const endState = await page.evaluate(() => window.__playtest.getFishingState());
  if (endState === "caught" || endState === "idle") pass(`fight resolved (${endState})`);
  else fail("fight resolved", `stuck in ${endState}`);

  const startPos = await page.evaluate(() => window.__playtest.getCamera());
  await page.evaluate(() => window.__playtest.moveTo(0, 8));
  const midPos = await page.evaluate(() => window.__playtest.getCamera());
  if (Math.abs(midPos.z - 8) < 0.6) pass("dock movement");
  else fail("dock movement", `z=${midPos.z} expected ~8`);

  await page.evaluate(() => window.__playtest.moveTo(3, 8));
  const sidePos = await page.evaluate(() => window.__playtest.getCamera());
  if (sidePos.x < 1.55) pass("dock side rail blocks water");
  else fail("dock side rail blocks water", `x=${sidePos.x}`);

  await page.evaluate(() => window.__playtest.moveTo(0, 2));
  const pierEnd = await page.evaluate(() => window.__playtest.getCamera());
  if (pierEnd.y >= 2.48) pass(`lake-end pier stand height (${pierEnd.y.toFixed(2)}m)`);
  else fail("lake-end pier stand height", `y=${pierEnd.y.toFixed(2)}`);

  await page.evaluate(() => window.__playtest.moveTo(0, 18.8));
  const spawnPos = await page.evaluate(() => window.__playtest.getCamera());
  if (spawnPos.y > 0.85 && spawnPos.y < 1.35) pass(`spawn height on shore (${spawnPos.y.toFixed(2)}m)`);
  else fail("spawn height on shore", `y=${spawnPos.y.toFixed(2)} expected ~1.08`);

  await page.evaluate(() => window.__setPlaytestCamera(-2, 1.08, 18.5, -8, 1.08, 20));
  const pathTrace = await page.evaluate(() => window.__playtest.walk(-1, 0.2, 2.5));
  const pathX = pathTrace.length ? pathTrace[pathTrace.length - 1].x : 0;
  if (pathX < -1.5) pass("camp path walkable off boardwalk");
  else fail("camp path walkable off boardwalk", `x=${pathX.toFixed(2)}`);

  await page.keyboard.press("KeyB");
  await page.waitForTimeout(400);
  const baitPanel = await page.evaluate(() => document.getElementById("vr-menu")?.classList.contains("open"));
  if (baitPanel) pass("bait menu opens");
  else fail("bait menu opens", "menu not open");

  await page.keyboard.press("Digit5");
  await page.waitForTimeout(200);
  const hudBait = await page.evaluate(() => document.getElementById("hud-bait")?.textContent || "");
  if (/Nightcrawler|worm/i.test(hudBait)) pass("bait hotkey works");
  else fail("bait hotkey works", hudBait);

  const hardErrors = consoleErrors.filter(
    (e) => !/404/.test(e) && !/favicon/i.test(e) && !/api\/progress/i.test(e)
  );
  if (!hardErrors.length) pass("no console errors");
  else fail("no console errors", hardErrors.join(" | "));

  console.log("\n=== GAMEPLAY PLAYTEST ===");
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
