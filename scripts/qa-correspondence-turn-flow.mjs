#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
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

    const opened = await white.evaluate((key) => window.__LUCIDMATE_QA__.openCorrespondence(key, "daily"), matchKey);
    if (!opened) {
        console.error("persistent board open state", await white.evaluate(() => window.__LUCIDMATE_QA__.snapshot()));
        console.error(
            "persistent board open toast",
            await white
                .locator(".toast")
                .textContent()
                .catch(() => null),
        );
        console.error("multiplayer ready", await white.evaluate(() => window.__LUCIDMATE_QA__.multiplayerReady()));
    }
    assert.equal(opened, true, "creator opens a persistent board");
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

    await white.waitForFunction(() => window.__LUCIDMATE_QA__.sceneGeometry() !== null);
    const hydrated = await white.evaluate(() => window.__LUCIDMATE_QA__.sceneGeometry());
    assert.equal(hydrated.moving, false, "reconnect hydrates the final board without replaying a stale move");
    assert.equal(hydrated.boardPieces, hydrated.renderedPieces, "reconnect renders one sprite per board piece");
    assert.equal(hydrated.layerChildren, hydrated.renderedPieces, "reconnect leaves no duplicate flying piece");

    await white.evaluate(() => window.__LUCIDMATE_QA__.scene().setMotionDurationScaleForQa(10));
    assert.equal(await black.evaluate(() => window.__LUCIDMATE_QA__.sendOnlineMove(52, 36)), true, "e7-e5 sends");
    await white.waitForFunction(() => window.__LUCIDMATE_QA__.sceneGeometry()?.moving === true);
    const beforeResize = await white.evaluate(() => window.__LUCIDMATE_QA__.sceneGeometry());
    assert.ok(beforeResize, "portrait scene exposes geometry before resize");
    await white.setViewportSize({ width: 956, height: 440 });
    await white.waitForFunction((previousSize) => {
        const geometry = window.__LUCIDMATE_QA__.sceneGeometry();
        return geometry && Math.abs(geometry.layout.size - previousSize) > 1;
    }, beforeResize.layout.size);
    await white.waitForFunction(() => window.__LUCIDMATE_QA__.sceneGeometry()?.moving === false);
    await white.waitForTimeout(300);
    const resized = await white.evaluate(() => window.__LUCIDMATE_QA__.sceneGeometry());
    assert.ok(resized, "resized scene exposes geometry");
    assert.equal(resized.boardPieces, resized.renderedPieces, "every authoritative piece is rendered after resize");
    assert.equal(resized.layerChildren, resized.renderedPieces, "resize leaves no orphaned flying piece");
    assert.deepEqual(resized.misalignedSquares, [], "every piece reflows onto its current landscape square");

    const clickSquare = async (square) => {
        const geometry = await white.evaluate(() => window.__LUCIDMATE_QA__.sceneGeometry());
        const file = square & 7;
        const rank = square >> 3;
        const x = (geometry.layout.originX + (file + 0.5) * geometry.layout.cell) * geometry.stageScale;
        const y = (geometry.layout.originY + (7 - rank + 0.5) * geometry.layout.cell) * geometry.stageScale;
        await white.mouse.click(x, y);
    };
    await clickSquare(6);
    await white.waitForFunction(() => window.__LUCIDMATE_QA__.sceneGeometry()?.selected === 6);
    await clickSquare(21);
    await white.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().turn === "b");
    assert.equal(
        await white.evaluate(() => window.__LUCIDMATE_QA__.sceneGeometry().misalignedSquares.length),
        0,
        "resized canvas accepts g1-f3 and keeps the next authoritative board aligned",
    );
    const landscapeUi = await white.evaluate(() => {
        const headline = document.querySelector(".hud-score strong");
        const opponent = document.querySelector(".online-banner-label");
        const toast = document.querySelector(".toast");
        const reactions = document.querySelector(".reaction-bar");
        const rect = (node) => (node ? node.getBoundingClientRect().toJSON() : null);
        return {
            headlineFits: headline ? headline.scrollWidth <= headline.clientWidth : false,
            opponentFits: opponent ? opponent.scrollWidth <= opponent.clientWidth : false,
            toast: rect(toast),
            reactions: rect(reactions),
        };
    });
    assert.equal(landscapeUi.headlineFits, true, "landscape turn headline is not clipped");
    assert.equal(landscapeUi.opponentFits, true, "landscape opponent name is not clipped");
    assert.ok(landscapeUi.toast, "move confirmation remains visible");
    assert.ok(landscapeUi.reactions, "landscape reaction panel remains visible");
    assert.ok(
        landscapeUi.toast.bottom <= landscapeUi.reactions.top,
        `landscape toast stays clear of the reaction panel (${JSON.stringify(landscapeUi)})`,
    );
    fs.mkdirSync("tmp", { recursive: true });
    await white.screenshot({ path: "tmp/correspondence-resize.png" });

    console.log("correspondence turn-flow QA passed: move stays open, reconnect restores state, resize reflows pieces");
} finally {
    await browser.close();
}
