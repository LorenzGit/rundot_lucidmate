#!/usr/bin/env node
/**
 * README screenshots, taken from the real game.
 *
 * Boots a Vite dev server, opens the QA-seeded main menu (three friend boards)
 * and a fresh board in headless Chromium at phone size, and writes 2x PNGs to
 * docs/screenshots. Re-run with `node scripts/capture-screenshots.mjs`
 * whenever the look changes so the README never shows a stale design.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const PORT = 5399;
const outputDir = path.join(process.cwd(), "docs", "screenshots");
const SHOTS = [
    { name: "lucidmate-menu.png", screen: "main", width: 393, height: 852 },
    { name: "lucidmate-gameplay.png", screen: "game", width: 393, height: 852 },
    { name: "lucidmate-gameplay-landscape.png", screen: "game", width: 956, height: 440 },
];

fs.mkdirSync(outputDir, { recursive: true });
const server = await createServer({
    configFile: path.join(process.cwd(), "vite.config.js"),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: PORT, strictPort: true },
});
await server.listen();
let browser;
try {
    browser = await chromium.launch();
    for (const shot of SHOTS) {
        const context = await browser.newContext({
            viewport: { width: shot.width, height: shot.height },
            deviceScaleFactor: 2,
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${PORT}/?screen=${shot.screen}&qa=1&renderer=webgl`, { waitUntil: "load" });
        await page.waitForFunction(() => globalThis.__LUCIDMATE_QA__ !== undefined, null, { timeout: 15_000 });
        if (shot.screen === "main") await page.waitForSelector(".inbox-match", { timeout: 10_000 });
        await page.waitForTimeout(1500);
        if (errors.length) throw new Error(`${shot.name}: page errors: ${errors.join("; ")}`);
        await page.screenshot({ path: path.join(outputDir, shot.name), animations: "disabled" });
        console.log(`wrote docs/screenshots/${shot.name}`);
        await context.close();
    }
} finally {
    await browser?.close();
    await server.close();
}
