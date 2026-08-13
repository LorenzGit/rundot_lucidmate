#!/usr/bin/env node
/**
 * Launch production preview and capture menu + match screenshots.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = process.env.LUCIDMATE_SCRATCH || path.join(root, "tmp/ui-captures");
fs.mkdirSync(scratch, { recursive: true });

const outLog = path.join(scratch, "ui-launch.log");
const envFail = path.join(scratch, "ui-launch-env.txt");

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function waitForHttp(url, attempts = 40) {
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url);
            if (res.ok || res.status < 500) return true;
        } catch {
            /* not up */
        }
        await sleep(250);
    }
    return false;
}

async function main() {
    let chromium;
    try {
        const pw = await import("playwright-core");
        chromium = pw.chromium;
    } catch (e) {
        fs.writeFileSync(envFail, `playwright-core import failed: ${e}\n`);
        process.exit(2);
    }

    let browser;
    let lastErr = null;
    for (const opts of [{ channel: "chrome" }, { channel: "msedge" }, {}]) {
        try {
            browser = await chromium.launch({ headless: true, ...opts });
            break;
        } catch (e) {
            lastErr = e;
        }
    }
    if (!browser) {
        fs.writeFileSync(envFail, `Could not launch browser.\nLast error: ${lastErr}\n`);
        process.exit(2);
    }

    const port = 4178;
    const preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port)], {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
    });
    let boot = "";
    preview.stdout.on("data", (d) => {
        boot += d.toString();
    });
    preview.stderr.on("data", (d) => {
        boot += d.toString();
    });

    const url = `http://127.0.0.1:${port}/`;
    if (!(await waitForHttp(url))) {
        fs.writeFileSync(envFail, `vite preview did not become ready.\n${boot}\n`);
        preview.kill("SIGTERM");
        await browser.close();
        process.exit(2);
    }

    const pageErrors = [];
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
    });
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    page.on("console", (msg) => {
        if (msg.type() === "error") pageErrors.push(`console.error: ${msg.text()}`);
    });

    // Avoid networkidle — optional 404s / long-poll keep it open forever.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => (document.body?.innerText || "").includes("LUCIDMATE"), { timeout: 45000 });
    await sleep(600);
    const menuPath = path.join(scratch, "ui-menu.png");
    await page.screenshot({ path: menuPath, fullPage: false });

    await page.getByRole("button", { name: /^play$/i }).click();
    await page.waitForFunction(
        () => {
            const t = document.body?.innerText || "";
            return t.includes("UNDO") && t.includes("HINT");
        },
        { timeout: 25000 },
    );
    // Let Pixi paint pieces
    await sleep(1500);
    const matchPath = path.join(scratch, "ui-match.png");
    await page.screenshot({ path: matchPath, fullPage: false });

    // DOM geometry proof for full-width helper bar (not brightness heuristics).
    const geometry = await page.evaluate(() => {
        const bar = document.querySelector(".helper-bar");
        const kids = bar ? [...bar.children] : [];
        const vw = window.innerWidth;
        const rect = (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, left: r.left };
        };
        return {
            viewportW: vw,
            bar: bar ? rect(bar) : null,
            children: kids.map((el) => ({
                className: el.className,
                ...rect(el),
            })),
        };
    });
    fs.writeFileSync(path.join(scratch, "ui-match-geometry.json"), JSON.stringify(geometry, null, 2));

    // Soft filter: ignore known optional 404s from host-only assets
    const hardErrors = pageErrors.filter((e) => !/404|Failed to load resource/i.test(e));

    // Fail capture if helper bar children do not span ~full bar width.
    let geometryFail = "";
    if (!geometry.bar || geometry.children.length < 3) {
        geometryFail = `helper-bar missing or <3 children: ${JSON.stringify(geometry)}`;
    } else {
        const bar = geometry.bar;
        const first = geometry.children[0];
        const last = geometry.children[geometry.children.length - 1];
        const span = last.right - first.left;
        const fill = span / bar.w;
        const leftInset = first.left - bar.left;
        const rightInset = bar.right - last.right;
        if (fill < 0.92) geometryFail = `helper children fill only ${(fill * 100).toFixed(1)}% of bar`;
        if (Math.abs(leftInset - rightInset) > 8) {
            geometryFail += ` asymmetric child insets L=${leftInset.toFixed(1)} R=${rightInset.toFixed(1)}`;
        }
        // Equal thirds within 12%
        const widths = geometry.children.map((c) => c.w);
        const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
        for (const w of widths) {
            if (Math.abs(w - avg) / avg > 0.12) {
                geometryFail += ` unequal child widths ${widths.join(",")}`;
                break;
            }
        }
    }

    fs.writeFileSync(
        outLog,
        [
            `url=${url}`,
            `pageErrors=${pageErrors.length}`,
            `hardErrors=${hardErrors.length}`,
            ...pageErrors.map((e) => `ERR ${e}`),
            `menu=${menuPath}`,
            `match=${matchPath}`,
            `geometry=${JSON.stringify(geometry)}`,
            geometryFail ? `geometryFail=${geometryFail}` : "geometryFail=",
            `bootTail=\n${boot.slice(-800)}`,
        ].join("\n"),
    );

    await browser.close();
    preview.kill("SIGTERM");
    if (hardErrors.length) {
        console.error("Hard page errors:", hardErrors);
        process.exit(1);
    }
    if (geometryFail) {
        console.error("Helper geometry fail:", geometryFail);
        process.exit(1);
    }
    console.log("screenshots ok", scratch);
}

main().catch((e) => {
    fs.writeFileSync(envFail, String(e?.stack || e));
    console.error(e);
    process.exit(2);
});
