#!/usr/bin/env node
/**
 * Render `public/thumbnail.jpg` from the game's own art.
 *
 * Boots a Vite dev server, opens `scripts/thumbnail.html` in headless Chromium,
 * and screenshots the 512x512 tile as a JPEG. The page composes the tile from
 * the game's own mascot art, palette and type, with no clock or randomness, so
 * re-running this produces the same tile until the art or layout changes and
 * the store tile cannot drift away from what the game looks like.
 *
 *   node scripts/make-thumbnail.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const root = process.cwd();
const output = path.join(root, "public", "thumbnail.jpg");
const PORT = 5398;

const server = await createServer({
    configFile: path.join(root, "vite.config.js"),
    logLevel: "silent",
    server: { port: PORT, strictPort: true },
});
await server.listen();

let browser;
try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
    const failures = [];
    page.on("pageerror", (error) => failures.push(String(error)));
    page.on("console", (message) => {
        if (message.type() === "error") failures.push(message.text());
    });

    await page.goto(`http://localhost:${PORT}/scripts/thumbnail.html`, { waitUntil: "networkidle" });
    await page.locator("#tile img").evaluate((img) => img.decode());
    await page.evaluate(() => document.fonts.ready);
    if (failures.length > 0) throw new Error(`Thumbnail page errored: ${failures.join("; ")}`);

    const bytes = await page.locator("#tile").screenshot({ type: "jpeg", quality: 92, animations: "disabled" });
    if (bytes.length < 8_000) throw new Error(`Thumbnail looks empty (${bytes.length} bytes)`);

    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bytes);
    console.log(`Wrote ${path.relative(root, output)} — 512x512 JPEG, ${(bytes.length / 1024).toFixed(1)} kB`);
} finally {
    await browser?.close();
    await server.close();
}
