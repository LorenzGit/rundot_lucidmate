import assert from "node:assert/strict";
import { normalizeLaunchParams } from "../src/sdk/launchParams.ts";
import { createPurchaseCoordinator } from "../src/systems/monetization/purchaseCoordinator.ts";
import { createReturnReminders } from "../src/systems/retention/returnReminders.ts";

const scheduled: string[] = [];
const cancelled: string[] = [];
let optedOut = false;
const reminders = createReturnReminders({
    idPrefix: "lucidmate",
    reminders: () => [
        { id: "d1", title: "Daily", body: "Auras ready", delaySeconds: 86_400 },
        { id: "d2", title: "Quest", body: "One capture left", delaySeconds: 172_800 },
        { id: "d3", title: "Rank", body: "One match left", delaySeconds: 259_200 },
    ],
    schedule: async ({ id }) => {
        scheduled.push(id);
        return true;
    },
    cancel: async (id) => {
        cancelled.push(id);
    },
    resolveLaunch: async () => ({ kind: "notification", params: { reminder_id: "lucidmate-d2" } }),
    isOptedOut: () => optedOut,
    track: () => undefined,
});

optedOut = true;
await reminders.refreshAll();
assert.deepEqual(scheduled, [], "opt-out suppresses all notification scheduling");
optedOut = false;
await reminders.refreshAll();
assert.deepEqual(scheduled, ["lucidmate-d1", "lucidmate-d2", "lucidmate-d3"]);
await reminders.cancelAll();
assert.deepEqual(cancelled, ["lucidmate-d1", "lucidmate-d2", "lucidmate-d3"]);
assert.equal(await reminders.resolveLaunch(), "d2", "notification launch resolves its reminder id");
assert.deepEqual(
    normalizeLaunchParams({ payload: '{"route":"match","matchKey":"lm-notify-001","pace":"daily"}' }),
    {
        payload: '{"route":"match","matchKey":"lm-notify-001","pace":"daily"}',
        route: "match",
        matchKey: "lm-notify-001",
        pace: "daily",
    },
    "SDK 5.24 recipe push payloads reopen their exact correspondence board",
);
assert.deepEqual(
    normalizeLaunchParams({ payload: "not-json", matchKey: "lm-direct-001" }),
    { payload: "not-json", matchKey: "lm-direct-001" },
    "malformed nested payloads fail soft without losing direct launch params",
);

let pending: {
    intentId: string;
    productId: string;
    catalogItemId: string;
    idempotencyKey: string;
    createdAtMs: number;
} | null = null;
const purchaseKeys: string[] = [];
let attempt = 0;
const coordinator = createPurchaseCoordinator<{ fulfilled: boolean }, { fulfilled: boolean }>({
    shop: {
        async purchase(_itemId, idempotencyKey) {
            purchaseKeys.push(idempotencyKey);
            attempt += 1;
            if (attempt === 1) throw new Error("transport interrupted");
            return { fulfilled: true };
        },
        async getOrderHistory() {
            return { fulfilled: false };
        },
    },
    pending: {
        load: () => pending,
        save: (intent) => {
            pending = intent;
        },
        clear: () => {
            pending = null;
        },
    },
    findConfirmedOrder: () => null,
    syncEntitlements: async () => undefined,
    classifyError: () => "unknown",
    createId: () => "stable-order",
    now: () => 1000,
});

const first = await coordinator.purchase("theme_pack", "lucidmate_theme_pack_cosmic");
assert.equal(first.status, "unknown");
assert.ok(pending, "ambiguous checkout preserves its purchase intent");
await coordinator.reconcilePending();
assert.equal(purchaseKeys.length, 1, "background reconciliation never opens checkout");
const second = await coordinator.purchase("theme_pack", "lucidmate_theme_pack_cosmic");
assert.equal(second.status, "confirmed");
assert.equal(purchaseKeys.length, 2);
assert.equal(purchaseKeys[0], purchaseKeys[1], "fresh tap retries the same idempotency key");
assert.equal(pending, null, "confirmed checkout clears the pending intent");

console.log("platform systems: notifications and purchase recovery ok");
