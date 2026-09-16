import assert from "node:assert/strict";
import { createMatchLaunchRouter } from "../src/sdk/matchLaunchRouter.ts";
import type { MatchLaunch } from "../src/sdk/launchParams.ts";

function gate<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

const board = (id: string): MatchLaunch => ({ matchKey: `lm-launch-${id}`, pace: "daily", roomCode: null });
const initial = gate<MatchLaunch | null>();
const busy = gate<void>();
const opening = gate<boolean>();
const opened: string[] = [];
const errors: unknown[] = [];
const router = createMatchLaunchRouter({
    resolve: () => initial.promise,
    waitUntilIdle: () => busy.promise,
    open: async (match) => {
        opened.push(match.matchKey);
        if (opened.length === 1) return opening.promise;
        if (match.matchKey === board("error").matchKey) throw new Error("join failed");
        return true;
    },
    onError: (error) => errors.push(error),
});
const start = router.start();
await router.receive({ matchKey: board("during-boot").matchKey });
initial.resolve(board("old-intent"));
await Promise.resolve();
assert.deepEqual(opened, [], "no room opens while another join owns the UI");
const firstTap = router.receive({ payload: JSON.stringify(board("latest-boot-tap")) });
busy.resolve();
await Promise.resolve();
assert.deepEqual(opened, [board("latest-boot-tap").matchKey], "newest tap survives boot and wins over stale intent");
const duringJoin = router.receive({ matchKey: board("during-join").matchKey });
const newest = router.receive({ matchKey: board("newest").matchKey });
await router.receive({ matchKey: "invalid" });
opening.resolve(true);
assert.equal(await start, true);
await Promise.all([firstTap, duringJoin, newest]);
assert.deepEqual(
    opened,
    [board("latest-boot-tap").matchKey, board("newest").matchKey],
    "taps during an active room join are queued; latest valid destination wins",
);
assert.equal(await router.receive({ matchKey: board("error").matchKey }), false);
assert.equal(errors.length, 1, "failed navigation is handled");
assert.equal(
    await router.receive({ matchKey: board("retry").matchKey }),
    true,
    "navigation continues after a failed join",
);
const cold = createMatchLaunchRouter({
    resolve: async () => board("cold"),
    waitUntilIdle: async () => {},
    open: async (match) => match.matchKey === board("cold").matchKey,
    onError: (error) => {
        throw error;
    },
});
assert.equal(await cold.start(), true, "cold launch opens resolved destination");
console.log("launch router: cold, warm, loading, busy joins, malformed taps and recovery passed");
