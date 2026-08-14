#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ headless: true });
const senderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const recipientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const sender = await senderContext.newPage();
const recipient = await recipientContext.newPage();
const rivalsUrl = "http://localhost:5195/?screen=rivals";

try {
    await sender.goto(rivalsUrl);
    await sender.waitForFunction(() => window.__LUCIDMATE_QA__?.snapshot().rivalDirectoryStatus === "ready");
    await recipient.goto(rivalsUrl);
    await recipient.waitForFunction(() => window.__LUCIDMATE_QA__?.snapshot().rivalDirectoryStatus === "ready");

    const recipientProfile = await recipient.evaluate(() =>
        JSON.parse(sessionStorage.getItem("__rundot_fake_tab_profile__")),
    );
    assert.match(recipientProfile.id, /^dev-tab-/);

    await sender.getByLabel("FIND A PLAYER").fill(recipientProfile.username);
    const result = sender.locator(".rival-discovery-card", { hasText: recipientProfile.username });
    await result.waitFor();
    assert.equal(await result.count(), 1, "exact username search returns the intended player once");
    await result.getByRole("button", { name: `Challenge ${recipientProfile.username}` }).click();

    await recipient.waitForFunction(
        () => window.__LUCIDMATE_QA__.snapshot().correspondenceMatches.some((match) => match.incoming),
        null,
        { timeout: 10_000 },
    );
    const invitation = (await recipient.evaluate(() => window.__LUCIDMATE_QA__.snapshot())).correspondenceMatches.find(
        (match) => match.incoming,
    );
    assert.ok(invitation, "recipient receives a durable invitation reference");
    assert.equal(invitation.opponent?.id.startsWith("dev-tab-"), true);

    // Cancelling an unopened directory challenge must acknowledge the shared
    // deletion instead of trying to reconnect to a chess room that does not
    // exist yet.
    await sender.locator(`[data-match-key="${invitation.matchKey}"] .inbox-match-manage`).click();
    await sender.getByRole("button", { name: "End match" }).click();
    await sender.getByRole("button", { name: "End match" }).click();
    await sender.waitForFunction(
        (matchKey) =>
            !window.__LUCIDMATE_QA__.snapshot().correspondenceMatches.some((match) => match.matchKey === matchKey),
        invitation.matchKey,
        { timeout: 10_000 },
    );
    await recipient.waitForFunction(
        (matchKey) =>
            !window.__LUCIDMATE_QA__.snapshot().correspondenceMatches.some((match) => match.matchKey === matchKey),
        invitation.matchKey,
        { timeout: 10_000 },
    );

    await sender.evaluate(() => {
        window.__LUCIDMATE_QA__.forceMenu();
        window.__LUCIDMATE_QA__.openMenu("rivals");
    });
    await sender.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().rivalDirectoryStatus === "ready");
    await sender.getByLabel("FIND A PLAYER").fill(recipientProfile.username);
    const rechallenge = sender.locator(".rival-discovery-card", { hasText: recipientProfile.username });
    await rechallenge.waitFor();
    await rechallenge.getByRole("button", { name: `Challenge ${recipientProfile.username}` }).click();
    await recipient.waitForFunction(
        () => window.__LUCIDMATE_QA__.snapshot().correspondenceMatches.some((match) => match.incoming),
        null,
        { timeout: 10_000 },
    );
    const activeInvitation = (
        await recipient.evaluate(() => window.__LUCIDMATE_QA__.snapshot())
    ).correspondenceMatches.find((match) => match.incoming);
    assert.ok(activeInvitation, "recipient receives the replacement invitation");

    // The challenger may open first, but is still authoritatively reserved as
    // Black. The invited player must always receive White and the first turn.
    await sender.waitForFunction(
        (matchKey) =>
            window.__LUCIDMATE_QA__.snapshot().correspondenceMatches.some((match) => match.matchKey === matchKey),
        activeInvitation.matchKey,
    );
    await sender.locator(`[data-match-key="${activeInvitation.matchKey}"] .inbox-match-open`).click();
    await sender.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "waiting", null, {
        timeout: 15_000,
    });
    assert.equal(
        (await sender.evaluate(() => window.__LUCIDMATE_QA__.snapshot())).onlineSeat,
        "b",
        "challenger is Black even when opening first",
    );

    await recipient.evaluate(() => window.__LUCIDMATE_QA__.forceMenu());
    const incomingCard = recipient.locator(`[data-match-key="${activeInvitation.matchKey}"]`);
    await incomingCard.waitFor();
    await incomingCard.getByText("YOUR FIRST MOVE").waitFor();
    fs.mkdirSync("tmp", { recursive: true });
    await recipient.screenshot({ path: "tmp/rivals-incoming-challenge.png" });

    await incomingCard.locator(".inbox-match-open").click();
    try {
        await recipient.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "playing", null, {
            timeout: 15_000,
        });
    } catch (error) {
        const [senderState, recipientState] = await Promise.all([
            sender.evaluate(() => window.__LUCIDMATE_QA__.snapshot()),
            recipient.evaluate(() => window.__LUCIDMATE_QA__.snapshot()),
        ]);
        throw new Error(`recipient did not open the rival board: ${JSON.stringify({ senderState, recipientState })}`, {
            cause: error,
        });
    }
    assert.equal(
        (await recipient.evaluate(() => window.__LUCIDMATE_QA__.snapshot())).activeMatchKey,
        activeInvitation.matchKey,
        "recipient opens the invited board",
    );

    await Promise.all([
        sender.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "playing", null, {
            timeout: 15_000,
        }),
        recipient.waitForFunction(() => window.__LUCIDMATE_QA__.snapshot().onlineStatus === "playing", null, {
            timeout: 15_000,
        }),
    ]);
    const senderState = await sender.evaluate(() => window.__LUCIDMATE_QA__.snapshot());
    const recipientState = await recipient.evaluate(() => window.__LUCIDMATE_QA__.snapshot());
    assert.equal(senderState.onlineSeat, "b", "challenger is Black");
    assert.equal(recipientState.onlineSeat, "w", "invited player is White");
    assert.equal(recipientState.turn, "w", "invited player has the first turn");
    assert.equal(senderState.activeMatchKey, activeInvitation.matchKey);
    assert.equal(recipientState.activeMatchKey, activeInvitation.matchKey);

    await recipient.evaluate(() => window.__LUCIDMATE_QA__.forceMenu());
    try {
        await recipient.waitForFunction(
            (matchKey) => {
                const state = window.__LUCIDMATE_QA__.snapshot();
                const match = state.correspondenceMatches.find((entry) => entry.matchKey === matchKey);
                return (
                    state.rivalDirectoryStatus === "ready" &&
                    !state.rivalInvitations.some((invite) => invite.matchKey === matchKey) &&
                    match?.phase === "playing" &&
                    match.incoming === false
                );
            },
            activeInvitation.matchKey,
            { timeout: 15_000 },
        );
    } catch (error) {
        console.error(
            "recipient did not settle the accepted invitation",
            JSON.stringify({
                matchKey: activeInvitation.matchKey,
                state: await recipient.evaluate(() => window.__LUCIDMATE_QA__.snapshot()),
            }),
        );
        throw error;
    }

    console.log(
        "rivals QA passed: acknowledged unopened cancellation, named challenge, durable inbox delivery, recipient White/first turn, and clean reconnect",
    );
} finally {
    await browser.close();
}
