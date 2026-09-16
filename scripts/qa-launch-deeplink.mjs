#!/usr/bin/env node
/**
 * Local proof: after a move, the opponent leaves the board and re-enters
 * through launch extras (matchKey/pace/route) — the path a notification tap uses.
 * White moves, Black opens via extras; Black replies, White opens via extras;
 * White moves again, Black opens via extras a second time (same player, <5 min).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const out = process.env.LUCIDMATE_QA_OUT ?? fs.mkdtempSync("/tmp/lucidmate-notifications-");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const whiteContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const blackContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const white = await whiteContext.newPage();
const black = await blackContext.newPage();
const base = "http://127.0.0.1:5195/?qa=1";
const errors = [];
for (const page of [white, black]) page.on("pageerror", (error) => errors.push(error.message));
const matchKey = `lm-qa-launch-${Date.now().toString(36)}`;

async function waitPlaying(page) {
    await page.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "playing");
}

async function leaveToMenu(page) {
    await page.evaluate(async () => {
        await window.__LUCIDMATE_QA__.leaveOnline();
        window.__LUCIDMATE_QA__.forceMenu();
    });
    await page.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().phase === "menu");
}

async function openFromLaunch(page) {
    const opened = await page.evaluate(
        (key) =>
            window.__LUCIDMATE_QA__.openFromLaunch({
                matchKey: key,
                pace: "daily",
                route: "match",
            }),
        matchKey,
    );
    assert.equal(opened, true, "launch extras opened the named board");
    await waitPlaying(page);
    const snap = await page.evaluate(() => window.__LUCIDMATE_QA__.snapshot());
    assert.equal(snap.activeMatchKey, matchKey);
    assert.equal(snap.phase, "playing");
    return snap;
}

try {
    await Promise.all([white.goto(base), black.goto(base)]);
    await Promise.all([
        white.waitForFunction(() => window.__LUCIDMATE_QA__),
        black.waitForFunction(() => window.__LUCIDMATE_QA__),
    ]);

    const opened = await white.evaluate((key) => window.__LUCIDMATE_QA__.openCorrespondence(key, "daily"), matchKey);
    assert.equal(opened, true, "creator opens a persistent board");
    const roomCode = (await white.evaluate(() => window.__LUCIDMATE_QA__.snapshot())).onlineRoomCode;
    assert.match(roomCode, /^[A-Z0-9]{6}$/);
    assert.equal(await black.evaluate((code) => window.__LUCIDMATE_QA__.joinCode(code), roomCode), true);
    await Promise.all([waitPlaying(white), waitPlaying(black)]);

    // Ada (White, first mover) plays e2-e4. Bob should open that board from extras.
    assert.equal(await black.evaluate(() => window.__LUCIDMATE_QA__.sendOnlineMove(12, 28)), true, "e2-e4");
    await white.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().turn === "b");
    await leaveToMenu(white);
    const afterFirst = await openFromLaunch(white);
    assert.equal(afterFirst.turn, "b", "first extras open lands on Black's turn after e2-e4");
    await white.screenshot({ path: `${out}/40-bob-opens-after-e4.png` });

    // Bob replies e7-e5. Ada opens from extras.
    assert.equal(await white.evaluate(() => window.__LUCIDMATE_QA__.sendOnlineMove(52, 36)), true, "e7-e5");
    await black.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().turn === "w");
    await leaveToMenu(black);
    const afterSecond = await openFromLaunch(black);
    assert.equal(afterSecond.turn, "w", "second extras open lands on White's turn after e7-e5");
    await black.screenshot({ path: `${out}/41-ada-opens-after-e5.png` });

    // Ada's second move g1-f3. Bob opens from extras again — same board, same player, <5 min.
    assert.equal(await black.evaluate(() => window.__LUCIDMATE_QA__.sendOnlineMove(6, 21)), true, "g1-f3");
    await white.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().turn === "b");
    await leaveToMenu(white);
    const afterThird = await openFromLaunch(white);
    assert.equal(afterThird.turn, "b", "third extras open (Bob again) lands on Black's turn after Nf3");
    assert.equal(
        afterThird.correspondenceMatches.find((match) => match.matchKey === matchKey)?.moveCount,
        3,
        "same board has three plies when Bob opens the second time",
    );
    await white.screenshot({ path: `${out}/42-bob-opens-again-after-nf3.png` });

    // Cold RUN launch with route extras only: exercise SDK context -> boot,
    // not just the warm navigation helper. Only launch input is injected;
    // room joins, seats, saved moves and networking use the local room server.
    await leaveToMenu(white);
    await white.addInitScript((key) => {
        let api;
        Object.defineProperty(window, "RundotGameAPI", {
            configurable: true,
            get: () => api,
            set: (value) => {
                api = value;
                let context;
                Object.defineProperty(api, "context", {
                    configurable: true,
                    get: () => context,
                    set: (next) => {
                        context = { ...next, launchParams: { route: "match", matchKey: key, pace: "daily" } };
                    },
                });
            },
        });
    }, matchKey);
    await white.reload();
    await white.waitForFunction(() => window.__LUCIDMATE_QA__?.snapshot().phase === "playing");
    const cold = await white.evaluate(() => window.__LUCIDMATE_QA__.snapshot());
    assert.equal(cold.activeMatchKey, matchKey, "cold route-only launch opens exact board");
    assert.equal(cold.correspondenceMatches.find((entry) => entry.matchKey === matchKey)?.moveCount, 3);
    await white.screenshot({ path: `${out}/43-cold-launch.png` });
    const profile = await white.evaluate(() => JSON.parse(sessionStorage.getItem("__rundot_fake_tab_profile__")));
    fs.writeFileSync(`${out}/fixture.json`, JSON.stringify({ matchKey, roomCode, profile, moveCount: 3 }, null, 2));
    assert.deepEqual(errors, [], "no uncaught browser errors");
    fs.writeFileSync(
        `${out}/report.json`,
        JSON.stringify(
            {
                ok: true,
                matchKey,
                roomCode,
                scenarios: ["three warm taps after alternating moves", "cold route-only SDK launch"],
                pageErrors: errors,
            },
            null,
            2,
        ),
    );
    console.log("launch deeplink ok", { matchKey, roomCode, out });
    const holdMs = Number(process.env.LUCIDMATE_QA_HOLD_MS ?? 0);
    if (holdMs > 0) {
        // Keep the other seat alive for ViewDeck: the local SDK disposes empty rooms.
        await whiteContext.close();
        await new Promise((resolve) => setTimeout(resolve, holdMs));
    }
} finally {
    await browser.close();
}
