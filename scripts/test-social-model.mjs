#!/usr/bin/env node
import assert from "node:assert/strict";
import { inboxActivity, inboxDueCopy, inboxStatus, resultPresentation, turnHeadline } from "../src/social/matchCopy.ts";
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

const reacted = sanitizeMatches([
    {
        ...first,
        reaction: { id: "nice_move", from: "player-1", at: 100, moveCount: 4 },
        reactionUsedAtMove: 4,
    },
])[0];
assert.equal(reacted.reaction.moveCount, 4, "reaction turn survives persistence");
assert.equal(reacted.reactionUsedAtMove, 4, "local reaction lock survives persistence");
assert.equal(
    sanitizeMatches([{ ...first, reaction: { id: "nice_move", from: "player-1", at: 100 } }])[0].reaction,
    null,
    "legacy reactions without an authoritative turn cannot lock the controls",
);

const timeoutLoss = {
    ...createMatchReference(keyA, "daily"),
    phase: "over",
    result: "loss",
    reason: "timeout",
    opponent: { id: "rival-1", username: "Mira", avatarUrl: null },
};
assert.equal(inboxStatus(timeoutLoss, false), "LOST ON TIME", "timeout loss is not labeled checkmate");
assert.equal(inboxDueCopy(timeoutLoss), "Lost on time", "timeout inbox copy names the clock");
assert.equal(inboxActivity({ ...timeoutLoss, phase: "waiting", opponent: null, result: null, reason: null }), null);

const timeoutResult = resultPresentation({
    status: "checkmate",
    reason: "timeout",
    winner: "b",
    result: "loss",
    movesPlayed: 18,
    captures: 2,
    checksGiven: 1,
    aurasEarned: 8,
    playerWon: false,
});
assert.equal(timeoutResult.kind, "timeout");
assert.equal(timeoutResult.stamp, "TIME OUT");
assert.equal(timeoutResult.title, "You ran out of time");
assert.notEqual(timeoutResult.stamp.includes("CHECK"), true, "timeout stamp never says checkmate");

const timeoutTurn = turnHeadline({
    turn: "w",
    playerColor: "w",
    opponentMode: "online",
    matchStatus: "checkmate",
    endReason: "timeout",
    thinking: false,
    waitingOnline: false,
    connectingOnline: false,
});
assert.equal(timeoutTurn.headline, "TIME OUT", "HUD names a clock loss, not checkmate");

console.log("social model checks passed");
