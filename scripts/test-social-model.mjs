#!/usr/bin/env node
import assert from "node:assert/strict";
import {
    CHESS_REACTIONS,
    createMatchReference,
    isMatchKey,
    rivalSummaries,
    sanitizeMatches,
    upsertMatch,
} from "../src/social/model.ts";

const keyA = "lm-social-test-match-a1";
const keyB = "lm-social-test-match-b2";
assert.equal(isMatchKey(keyA), true, "valid stable correspondence key");
assert.equal(isMatchKey("../../bad"), false, "invalid room key rejected");
assert.deepEqual(
    CHESS_REACTIONS.map((reaction) => reaction.id),
    ["nice_move", "didnt_see_it", "good_game", "rematch"],
    "reactions are a fixed safe allowlist",
);

const first = { ...createMatchReference(keyA, "daily"), updatedAt: 10 };
const second = {
    ...createMatchReference(keyB, "relaxed"),
    updatedAt: 20,
    phase: "over",
    result: "win",
    opponent: { id: "rival-1", username: "Mira", avatarUrl: null },
};
assert.deepEqual(
    upsertMatch([first], second).map((match) => match.matchKey),
    [keyB, keyA],
    "inbox remains recency ordered",
);
assert.deepEqual(rivalSummaries([first, second])[0], {
    id: "rival-1",
    username: "Mira",
    avatarUrl: null,
    games: 1,
    wins: 1,
    losses: 0,
    draws: 0,
    active: 0,
    lastPlayedAt: 20,
});

const sanitized = sanitizeMatches([
    { ...second, opponent: { id: "rival-1", username: "M".repeat(100), avatarUrl: null } },
    { ...first, matchKey: "bad" },
]);
assert.equal(sanitized.length, 1, "malformed records dropped");
assert.equal(sanitized[0].opponent.username.length, 40, "profile text bounded");
assert.equal(sanitized[0].unavailable, false, "legacy boards remain available unless a reconnect fails");

const incoming = sanitizeMatches([{ ...first, incoming: true }]);
assert.equal(incoming[0].incoming, true, "incoming challenge state survives persistence");
assert.equal(sanitizeMatches([{ ...first }])[0].incoming, false, "legacy boards default to outgoing");

console.log("social model checks passed");
