#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

try {
    await page.goto("http://localhost:5195/?screen=main");
    await page.getByTestId("main-menu").waitFor();
    await page.waitForFunction(() => window.__LUCIDMATE_QA__);

    assert.equal(
        await page.evaluate(() => window.__LUCIDMATE_QA__.multiplayerReady()),
        false,
        "plain preview fails closed",
    );
    const hostedWithoutRooms = await page.evaluate(() => {
        const api = window.RundotGameAPI;
        api.isMock = () => false;
        if (api.host) api.host._roomServerUrl = "";
        return window.__LUCIDMATE_QA__.multiplayerReady();
    });
    assert.equal(
        hostedWithoutRooms,
        false,
        "Preview App without a configured room server must not enable multiplayer actions",
    );
    const hostedWithRooms = await page.evaluate(() => {
        const api = window.RundotGameAPI;
        if (api.host) api.host._roomServerUrl = "https://rooms.example.test";
        return window.__LUCIDMATE_QA__.multiplayerReady();
    });
    assert.equal(hostedWithRooms, true, "a real host needs a positive room-server URL");
    await page.evaluate(() => {
        const api = window.RundotGameAPI;
        api.isMock = () => false;
        if (api.host) api.host._roomServerUrl = "";
    });

    const liveRival = page.getByRole("button", { name: /Find a live rival/ });
    assert.equal(await liveRival.isDisabled(), true, "live matchmaking is visibly disabled without a room server");
    await page.getByText("Available when connected to RUN").waitFor();

    const codeInput = page.getByTestId("join-code-input");
    assert.equal(await codeInput.isDisabled(), true, "room code input is disabled without a room server");
    assert.equal(await codeInput.getAttribute("placeholder"), "OPEN IN RUN TO JOIN");

    await page.getByRole("button", { name: /Challenge a friend/ }).click();
    await page.getByRole("heading", { name: "Challenge a friend" }).waitFor();
    await page.getByTestId("multiplayer-preview-note").waitFor();
    assert.equal(
        await page.getByRole("button", { name: "CREATE BOARD" }).count(),
        0,
        "preview cannot create a phantom board",
    );
    assert.equal(await page.locator(".toast").count(), 0, "capability explanation is contextual, not a global toast");
    await page.getByRole("button", { name: "PLAY THE COMPUTER" }).click();
    await page.getByRole("heading", { name: "Practice" }).waitFor();

    console.log("preview multiplayer-state QA passed: real host without room server stays disabled; no phantom board");
} finally {
    await browser.close();
}
