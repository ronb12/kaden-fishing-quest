/**
 * Headless playtest: load game, capture errors, verify assets, screenshot key views.
 * Usage: node scripts/playtest-assets.mjs
 */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join } from "path";
import { fileURLToPath } from "url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const PORT = 4173;

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

const server = await startServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleErrors = [];
const assetWarnings = [];

page.on("console", (msg) => {
  const text = msg.text();
  if (msg.type() === "error") consoleErrors.push(text);
  if (/Failed to load/i.test(text)) assetWarnings.push(text);
});

page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));

const failedAssets = [];
page.on("response", (res) => {
  if (res.url().includes(".glb") && res.status() >= 400) {
    failedAssets.push(`${res.status()} ${res.url()}`);
  }
});

try {
  await page.goto(`http://127.0.0.1:${PORT}/?playtest=1`, { waitUntil: "domcontentloaded", timeout: 60000 });

  await page.waitForFunction(
    () => document.getElementById("asset-loading")?.classList.contains("hidden"),
    { timeout: 120000 }
  );
  await page.waitForFunction(() => typeof window.__setPlaytestCamera === "function", { timeout: 30000 });
  await page.waitForTimeout(2000);

  const views = [
    { name: "dock-spawn", x: 0, y: 1.6, z: 16.8, lookX: 0, lookY: 1, lookZ: 8 },
    { name: "dock-end", x: 0, y: 1.6, z: 4, lookX: 0, lookY: 0.8, lookZ: -8 },
    { name: "camp-path", x: -8, y: 1.6, z: 16, lookX: -14, lookY: 1.2, lookZ: 20 },
    { name: "cabin-exterior", x: -10, y: 1.6, z: 24, lookX: -14, lookY: 2.5, lookZ: 20 },
    { name: "cabin-interior", x: -14, y: 1.6, z: 20, lookX: -14, lookY: 1.4, lookZ: 18 },
    { name: "lake-wide", x: 6, y: 2.5, z: 10, lookX: -5, lookY: 0.5, lookZ: -10 },
  ];

  for (const view of views) {
    await page.evaluate(
      ({ x, y, z, lookX, lookY, lookZ }) => window.__setPlaytestCamera(x, y, z, lookX, lookY, lookZ),
      view
    );
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(root, `playtest-${view.name}.png`) });
  }

  const pixelChecks = await page.evaluate(() => {
    const canvas = document.getElementById("game-canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { blackScreen: false, avgLuminance: -1, skipped: true };
    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let sum = 0;
    let samples = 0;
    const step = 48;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        sum += pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
        samples++;
      }
    }
    const avg = sum / samples;
    return { blackScreen: avg < 8, avgLuminance: Math.round(avg) };
  });

  const glbCount = await page.evaluate(
    () => performance.getEntriesByType("resource").filter((e) => e.name.includes(".glb")).length
  );

  console.log("\n=== PLAYTEST RESULTS ===");
  console.log("Console errors:", consoleErrors.length ? consoleErrors : "(none)");
  console.log("Asset warnings:", assetWarnings.length ? assetWarnings : "(none)");
  console.log("Failed HTTP assets:", failedAssets.length ? failedAssets : "(none)");
  console.log("GLB resources loaded:", glbCount);
  console.log("Pixel check:", pixelChecks, "(screenshots are the visual gate)");

  const hardErrors = consoleErrors.filter((e) => !/404/.test(e) && !/WebGL context/.test(e));
  if (hardErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
