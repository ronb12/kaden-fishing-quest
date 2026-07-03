/**
 * Rasterize SVG icons to PNG + ICO for browsers and home-screen installs.
 * Run: node scripts/generate-icons.mjs
 */
import { chromium } from "playwright";
import toIco from "to-ico";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function pngBufferFromSvg(svgPath, size) {
  const svg = readFileSync(svgPath, "utf8");
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block}</style></head><body><img id="icon" width="${size}" height="${size}" src="${dataUrl}" alt=""></body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: "networkidle" });
  const buffer = await page.locator("#icon").screenshot({ type: "png", omitBackground: false });
  await browser.close();
  return buffer;
}

async function svgToPng(svgPath, outPath, size) {
  const buffer = await pngBufferFromSvg(svgPath, size);
  writeFileSync(outPath, buffer);
  console.log(`wrote ${outPath} (${size}x${size})`);
}

async function main() {
  await svgToPng(join(root, "app-icon.svg"), join(root, "app-icon.png"), 180);
  await svgToPng(join(root, "app-icon.svg"), join(root, "app-icon-512.png"), 512);
  await svgToPng(join(root, "favicon.svg"), join(root, "favicon-32.png"), 32);
  await svgToPng(join(root, "favicon.svg"), join(root, "favicon-16.png"), 16);

  const ico = await toIco([
    await pngBufferFromSvg(join(root, "favicon.svg"), 16),
    await pngBufferFromSvg(join(root, "favicon.svg"), 32),
    await pngBufferFromSvg(join(root, "favicon.svg"), 48),
  ]);
  writeFileSync(join(root, "favicon.ico"), ico);
  console.log("wrote favicon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
