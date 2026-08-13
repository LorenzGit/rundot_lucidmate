#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ headless: true });
const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
const offline = await browser.newContext({ viewport: { width: 390, height: 844 } });
const firstPage = await first.newPage();
const secondPage = await second.newPage();
const offlinePage = await offline.newPage();
const base = "http://localhost:5195/qa/main?qa=1&socialPreview=waiting";
const matchKey = `lm-qa-management-${Date.now().toString(36)}`;

try {
    await Promise.all([firstPage.goto(base), secondPage.goto(base)]);
    await Promise.all([
        firstPage.waitForFunction(() => window.__LUCIDMATE_QA__),
        secondPage.waitForFunction(() => window.__LUCIDMATE_QA__),
    ]);

    assert.equal(
        await firstPage.evaluate((key) => window.__LUCIDMATE_QA__.openCorrespondence(key, "daily"), matchKey),
        true,
        "creator opens a persistent board",
    );
    await firstPage.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "waiting");
    const roomCode = (await firstPage.evaluate(() => window.__LUCIDMATE_QA__.snapshot())).onlineRoomCode;
    assert.match(roomCode, /^[A-Z0-9]{6}$/, "creator receives a six-character invite code");

    assert.equal(
        await secondPage.evaluate((code) => window.__LUCIDMATE_QA__.joinCode(code), roomCode),
        true,
        "second independent player joins through the visible invite-code flow",
    );
    await Promise.all([
        firstPage.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "playing"),
        secondPage.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "playing"),
    ]);
    assert.notEqual(
        (await firstPage.evaluate(() => window.__LUCIDMATE_QA__.snapshot())).onlineSeat,
        (await secondPage.evaluate(() => window.__LUCIDMATE_QA__.snapshot())).onlineSeat,
        "players occupy opposite seats",
    );
    const joined = await secondPage.evaluate(() => window.__LUCIDMATE_QA__.snapshot());
    assert.equal(joined.onlineExperience, "async", "invite code restores correspondence mode");
    assert.equal(joined.activeMatchKey, matchKey, "invite code opens the creator’s exact board");

    await firstPage.evaluate(async () => {
        await window.__LUCIDMATE_QA__.leaveOnline();
        window.__LUCIDMATE_QA__.forceMenu();
    });
    await firstPage.locator(`[data-match-key="${matchKey}"] .inbox-match-manage`).click();
    await firstPage.getByRole("button", { name: "End match" }).click();
    await firstPage.getByRole("button", { name: "End match" }).click();
    await firstPage.waitForFunction(
        (key) =>
            window.__LUCIDMATE_QA__.snapshot().correspondenceMatches.find((match) => match.matchKey === key)?.phase ===
            "over",
        matchKey,
    );
    await secondPage.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "over");

    await firstPage.locator(`[data-match-key="${matchKey}"] .inbox-match-manage`).click();
    await firstPage.getByRole("button", { name: "Remove this card" }).click();
    const remaining = await firstPage.evaluate(
        (key) => window.__LUCIDMATE_QA__.snapshot().correspondenceMatches.some((match) => match.matchKey === key),
        matchKey,
    );
    assert.equal(remaining, false, "ended board removes from the saved list");

    const waitingKey = `lm-qa-cancel-${Date.now().toString(36)}`;
    assert.equal(
        await firstPage.evaluate((key) => window.__LUCIDMATE_QA__.openCorrespondence(key, "relaxed"), waitingKey),
        true,
        "creator opens a waiting challenge",
    );
    await firstPage.evaluate(async () => {
        await window.__LUCIDMATE_QA__.leaveOnline();
        window.__LUCIDMATE_QA__.forceMenu();
    });
    await firstPage.locator(`[data-match-key="${waitingKey}"] .inbox-match-manage`).click();
    await firstPage.getByRole("button", { name: "End match" }).click();
    await firstPage.getByRole("button", { name: "End match" }).click();
    await firstPage.waitForFunction(
        (key) =>
            window.__LUCIDMATE_QA__.snapshot().correspondenceMatches.find((match) => match.matchKey === key)?.phase ===
            "over",
        waitingKey,
    );
    const cancelled = await firstPage.evaluate(
        (key) => window.__LUCIDMATE_QA__.snapshot().correspondenceMatches.find((match) => match.matchKey === key),
        waitingKey,
    );
    assert.equal(cancelled?.phase, "over", "waiting challenge reaches an authoritative terminal state");
    assert.equal(cancelled?.reason, "cancelled", "waiting challenge is cancelled without awarding a win");

    await offlinePage.goto(base);
    await offlinePage.waitForFunction(() => window.__LUCIDMATE_QA__);
    await offlinePage.evaluate(() => {
        delete window.__RUNDOT_MULTIPLAYER_DEV_SERVER__;
    });
    const startedAt = Date.now();
    await offlinePage.locator('[data-match-key="lm-preview-waiting-only-001"] .inbox-match-open').click();
    await offlinePage.locator('[data-match-key="lm-preview-waiting-only-001"].unavailable').waitFor();
    assert.ok(Date.now() - startedAt < 2_000, "offline legacy board fails fast instead of timing out");
    await offlinePage.getByRole("dialog", { name: "Friend board" }).waitFor();
    await offlinePage.getByText("We couldn’t find this game online.").waitFor();
    await offlinePage.getByRole("button", { name: "Remove this card" }).click();
    assert.equal(
        await offlinePage.locator('[data-match-key="lm-preview-waiting-only-001"]').count(),
        0,
        "unavailable legacy board remains removable",
    );

    console.log(
        "correspondence management QA passed: invite-code join, opposite seats, contextual recovery, end, cancel, and removal",
    );
} finally {
    await browser.close();
}
