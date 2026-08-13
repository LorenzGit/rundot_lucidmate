#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ headless: true });
const whiteContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const blackContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const white = await whiteContext.newPage();
const black = await blackContext.newPage();
const base = "http://localhost:5195/qa/main?qa=1&socialPreview=waiting";
const matchKey = `lm-qa-turn-${Date.now().toString(36)}`;

try {
    await Promise.all([white.goto(base), black.goto(base)]);
    await Promise.all([
        white.waitForFunction(() => window.__LUCIDMATE_QA__),
        black.waitForFunction(() => window.__LUCIDMATE_QA__),
    ]);

    assert.equal(
        await white.evaluate((key) => window.__LUCIDMATE_QA__.openCorrespondence(key, "daily"), matchKey),
        true,
        "creator opens a persistent board",
    );
    const roomCode = (await white.evaluate(() => window.__LUCIDMATE_QA__.snapshot())).onlineRoomCode;
    assert.match(roomCode, /^[A-Z0-9]{6}$/);
    assert.equal(await black.evaluate((code) => window.__LUCIDMATE_QA__.joinCode(code), roomCode), true);
    await Promise.all([
        white.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "playing"),
        black.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "playing"),
    ]);

    assert.equal(await white.evaluate(() => window.__LUCIDMATE_QA__.sendOnlineMove(12, 28)), true, "e2-e4 sends");
    await Promise.all([
        white.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().turn === "b"),
        black.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().turn === "b"),
    ]);
    await white.waitForTimeout(1_000);
    const afterMove = await white.evaluate(() => window.__LUCIDMATE_QA__.snapshot());
    assert.equal(afterMove.phase, "playing", "confirmed asynchronous move stays on the board");
    assert.equal(afterMove.activeMatchKey, matchKey, "active saved board remains attached after the move");
    assert.equal(afterMove.onlineStatus, "playing", "room connection remains active after the move");

    await white.evaluate(async () => {
        await window.__LUCIDMATE_QA__.leaveOnline();
        window.__LUCIDMATE_QA__.forceMenu();
    });
    assert.equal(
        await white.evaluate((key) => window.__LUCIDMATE_QA__.openCorrespondence(key, "daily"), matchKey),
        true,
        "saved board reconnects through its persistent key",
    );
    const reconnected = await white.evaluate(() => window.__LUCIDMATE_QA__.snapshot());
    assert.equal(reconnected.phase, "playing");
    assert.equal(reconnected.activeMatchKey, matchKey);
    assert.equal(reconnected.turn, "b", "reconnected client receives the authoritative post-move turn");
    assert.equal(reconnected.onlineRoomCode, roomCode, "warm reconnect returns to the exact room");
    assert.equal(
        reconnected.correspondenceMatches.find((match) => match.matchKey === matchKey)?.moveCount,
        1,
        "reconnected client receives the authoritative move history",
    );
    assert.equal(
        reconnected.correspondenceMatches.find((match) => match.matchKey === matchKey)?.unavailable,
        false,
        "transient reconnect does not poison the saved card",
    );

    console.log("correspondence turn-flow QA passed: move stays open and room reconnect restores state");
} finally {
    await browser.close();
}
