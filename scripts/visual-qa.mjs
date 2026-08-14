#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = path.join(root, "tmp", "visual-qa");
const port = 5397;
const problems = [];
let screenshots = 0;

const viewports = [
    { name: "phone-tall", width: 393, height: 852, scale: 2 },
    { name: "phone-short", width: 375, height: 667, scale: 2 },
    { name: "tablet", width: 820, height: 1180, scale: 2 },
    { name: "desktop", width: 1440, height: 900, scale: 1 },
    { name: "phone-landscape", width: 956, height: 440, scale: 1 },
];

const screens = [
    { name: "menu", screen: "main" },
    { name: "practice", screen: "practice" },
    { name: "challenge", screen: "challenge" },
    { name: "rivals", screen: "rivals" },
    { name: "league", screen: "league" },
    { name: "dreams", screen: "dreams" },
    { name: "lounge", screen: "lounge", prepare: true },
    { name: "daily-rewards", screen: "daily-rewards" },
    { name: "daily-quests", screen: "daily-quests" },
    { name: "stats", screen: "stats" },
    { name: "settings", screen: "settings" },
    { name: "game", screen: "game" },
    { name: "reactions", screen: "game", reactions: true },
    { name: "connection", screen: "game", connection: true },
];

function note(message) {
    problems.push(message);
}

async function inspectLayout(page, label) {
    const audit = await page.evaluate(() => {
        const rootElement = document.documentElement;
        const visibleText = [...document.querySelectorAll("body *")].filter((element) => {
            if (!(element instanceof HTMLElement)) return false;
            if (element.closest(".sr-only") || element.getAttribute("aria-hidden") === "true") return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
        const textSizes = visibleText
            .filter((element) =>
                [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()),
            )
            .map((element) => ({
                text: element.textContent?.trim().slice(0, 40) ?? "",
                size: Number.parseFloat(getComputedStyle(element).fontSize),
            }))
            .filter((entry) => Number.isFinite(entry.size));
        const smallest = textSizes.sort((a, b) => a.size - b.size)[0] ?? null;
        return {
            bodyWidth: document.body.scrollWidth,
            viewportWidth: innerWidth,
            bodyHeight: document.body.scrollHeight,
            viewportHeight: innerHeight,
            smallest,
            version: document.querySelector(".inbox-version")?.textContent?.trim() ?? null,
            selectedText: getSelection()?.toString() ?? "",
            reducedMotion: rootElement.dataset.reducedMotion,
        };
    });
    if (audit.bodyWidth > audit.viewportWidth + 4) {
        note(`${label}: horizontal overflow ${audit.bodyWidth}px > ${audit.viewportWidth}px`);
    }
    if (audit.bodyHeight > audit.viewportHeight + 4) {
        note(`${label}: document scrolls ${audit.bodyHeight}px > ${audit.viewportHeight}px`);
    }
    if (audit.smallest && audit.smallest.size < 10) {
        note(`${label}: text below 10px (${audit.smallest.size}px, "${audit.smallest.text}")`);
    }
    return audit;
}

fs.mkdirSync(outputDir, { recursive: true });
const server = await createServer({
    configFile: path.join(root, "vite.config.js"),
    logLevel: "silent",
    server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();

let browser;
try {
    browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    for (const viewport of viewports) {
        const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: viewport.scale,
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => note(`${viewport.name}: page error: ${error.message}`));
        page.on("console", (message) => {
            if (message.type() === "error") note(`${viewport.name}: console error: ${message.text()}`);
        });

        for (const shot of screens) {
            await page.goto(`http://127.0.0.1:${port}/?screen=${shot.screen}&qa=1`, { waitUntil: "load" });
            await page.waitForFunction(() => globalThis.__LUCIDMATE_QA__ !== undefined, null, { timeout: 15_000 });
            if (shot.prepare) {
                await page.evaluate(() => {
                    globalThis.__LUCIDMATE_QA__.setMatchesPlayed(5);
                    globalThis.__LUCIDMATE_QA__.grantAuras(2_000);
                });
                await page.waitForSelector(".shop-card", { timeout: 10_000 });
                const offers = await page.locator(".shop-card").count();
                if (offers !== 3) note(`${viewport.name}: expected 3 general Run Bits offers, found ${offers}`);
            }
            if (shot.reactions) {
                await page.evaluate(() => globalThis.__LUCIDMATE_QA__.previewCorrespondenceGame());
                await page.waitForSelector(".reaction-bar", { timeout: 10_000 });
            }
            if (shot.connection) {
                await page.evaluate(() => globalThis.__LUCIDMATE_QA__.previewConnectionFailure());
                await page.waitForSelector(".connection-card", { timeout: 10_000 });
            }
            if (shot.screen === "game") {
                await page.waitForSelector("canvas", { timeout: 15_000 });
                await page.waitForTimeout(900);
            } else {
                await page.waitForTimeout(350);
            }

            const label = `${viewport.name}/${shot.name}`;
            const audit = await inspectLayout(page, label);
            if (shot.screen === "main" && audit.version !== "v1.0.15") {
                note(`${label}: visible version is "${audit.version ?? "missing"}"`);
            }
            await page.screenshot({ path: path.join(outputDir, `${viewport.name}-${shot.name}.png`) });
            screenshots += 1;

            const scrollRegion = page.locator("[data-testid='screen-scroll-region']");
            if ((await scrollRegion.count()) > 0) {
                const canScroll = await scrollRegion.evaluate(
                    (element) => element.scrollHeight > element.clientHeight + 8,
                );
                if (canScroll) {
                    await scrollRegion.evaluate((element) => {
                        element.scrollTop = element.scrollHeight;
                    });
                    await page.waitForTimeout(150);
                    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-${shot.name}-end.png`) });
                    screenshots += 1;
                }
            }
        }
        await context.close();
    }
} finally {
    await browser?.close();
    await server.close();
}

console.log(`Wrote ${screenshots} screenshots to ${path.relative(root, outputDir)}`);
if (problems.length > 0) {
    console.error(`Visual QA failed (${problems.length}):`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
}
console.log(
    "Visual QA passed: 14 surfaces × 5 viewports, async rivals, reactions, reconnect UI, typography, overflow, and console gates.",
);
