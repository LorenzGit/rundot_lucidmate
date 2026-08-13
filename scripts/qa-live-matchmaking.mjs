#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ headless: true });
const firstContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const first = await firstContext.newPage();
const second = await secondContext.newPage();
const home = "http://127.0.0.1:5195/";

try {
    await Promise.all([first.goto(home), second.goto(home)]);
    await Promise.all([
        first.getByRole("button", { name: /Find a live rival/ }).click(),
        second.getByRole("button", { name: /Find a live rival/ }).click(),
    ]);
    await Promise.all([
        first.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "playing", null, {
            timeout: 15_000,
        }),
        second.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "playing", null, {
            timeout: 15_000,
        }),
    ]);
    const firstState = await first.evaluate(() => window.__LUCIDMATE_QA__.snapshot());
    const secondState = await second.evaluate(() => window.__LUCIDMATE_QA__.snapshot());
    assert.notEqual(firstState.onlineSeat, secondState.onlineSeat, "live rivals occupy opposite seats");
    assert.equal(await first.getByRole("dialog", { name: "Finding a rival" }).count(), 0);
    assert.equal(await second.getByRole("dialog", { name: "Finding a rival" }).count(), 0);

    await Promise.all([firstContext.close(), secondContext.close()]);
    const cancelContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const cancelPage = await cancelContext.newPage();
    await cancelPage.goto(home);
    await cancelPage.getByRole("button", { name: /Find a live rival/ }).click();
    await cancelPage.getByRole("dialog", { name: "Finding a rival" }).waitFor();
    await cancelPage.getByRole("button", { name: "Cancel search" }).click();
    assert.equal(await cancelPage.getByRole("dialog", { name: "Finding a rival" }).count(), 0);
    assert.equal((await cancelPage.evaluate(() => window.__LUCIDMATE_QA__.snapshot())).phase, "menu");
    await cancelPage.waitForTimeout(8_500);
    const cancelled = await cancelPage.evaluate(() => window.__LUCIDMATE_QA__.snapshot());
    assert.equal(cancelled.phase, "menu", "a stale matchmaking result cannot open a late match");
    assert.equal(cancelled.matchmakingVisible, false);
    await cancelContext.close();

    console.log("live matchmaking QA passed: blocking pair flow, opposite seats, immediate and durable cancel");
} finally {
    await browser.close();
}
