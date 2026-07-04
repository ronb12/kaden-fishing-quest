/**
 * Mobile touch playtest — tutorial must not block controls; cast flow works.
 */
import { chromium, devices } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join } from "path";
import { fileURLToPath } from "url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const PORT = 4178;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
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
function pass(name) {
  console.log("ok:", name);
}
function fail(name, detail) {
  issues.push({ name, detail });
  console.error("FAIL:", name, detail);
}

const server = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices["iPhone 13"],
  hasTouch: true,
});
const page = await context.newPage();

try {
  await page.goto(`http://127.0.0.1:${PORT}/?playtest=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => document.getElementById("asset-loading")?.classList.contains("hidden"),
    { timeout: 120000 }
  );
  await page.waitForFunction(() => window.__playtest?.cast, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const touchUi = await page.evaluate(() => ({
    touchMode: document.body.classList.contains("touch-mode"),
    controlsVisible: document.getElementById("touch-controls")?.classList.contains("visible"),
    tutorialOpen: document.getElementById("tutorial-overlay")?.classList.contains("show"),
    loadingHidden: document.getElementById("asset-loading")?.classList.contains("hidden"),
  }));

  if (touchUi.touchMode) pass("touch mode active");
  else fail("touch mode active", JSON.stringify(touchUi));

  if (touchUi.controlsVisible) pass("touch controls visible");
  else fail("touch controls visible", JSON.stringify(touchUi));

  if (!touchUi.tutorialOpen) pass("tutorial not blocking mobile");
  else fail("tutorial not blocking mobile", "tutorial overlay open");

  const castBtn = page.locator("#touch-action");
  await castBtn.dispatchEvent("touchstart");
  await page.waitForTimeout(400);
  await castBtn.dispatchEvent("touchend");
  await page.waitForTimeout(300);

  const castState = await page.evaluate(() => window.__playtest.getFishingState());
  if (castState === "casting" || castState === "waiting") pass(`touch cast started (${castState})`);
  else fail("touch cast started", castState);

  const joy = page.locator("#touch-joystick");
  const box = await joy.boundingBox();
  if (box) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
    const moved = await page.evaluate(() => {
      window.__playtest.moveTo(0, 8);
      return window.__playtest.getCamera();
    });
    if (moved) pass("mobile playtest API ok");
  }

  console.log("\n=== MOBILE PLAYTEST ===");
  console.log("Failed:", issues.length);
  if (issues.length) {
    for (const i of issues) console.log(` - ${i.name}: ${i.detail}`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error("CRASH:", err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
