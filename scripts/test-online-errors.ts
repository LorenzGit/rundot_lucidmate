#!/usr/bin/env node
import assert from "node:assert/strict";
import {
    describeCorrespondenceError,
    describeJoinError,
    describeRivalsError,
    isDuplicateSessionError,
} from "../src/game/chess/joinErrors.ts";

assert.equal(
    describeJoinError(new Error("duplicate session: player already connected")),
    "You’re already connected to this board. To test both sides, join from a different RUN account.",
);
assert.equal(isDuplicateSessionError(new Error("Duplicate session for player secret-id")), true);
assert.equal(
    describeRivalsError(new Error("Duplicate session for player secret-id: this identity is already in the room")),
    "Your rival list is open in another RUN window. Close it there, then retry here.",
);
assert.equal(describeRivalsError(new Error("socket exploded")).includes("socket exploded"), false);
assert.equal(
    describeJoinError(new Error("ROOM_NOT_FOUND")),
    "Match code not found. Check all 6 characters or ask for a new code.",
);
assert.equal(
    describeJoinError(new Error("transport timed out")),
    "We couldn’t reach that board. Try again in a moment.",
);
assert.equal(
    describeCorrespondenceError(new Error("This board belongs to two other players")),
    "This board belongs to another RUN account.",
);
assert.equal(
    describeCorrespondenceError(new Error("The match did not send its board state.")),
    "The board is taking too long to wake up. Try again in a moment.",
);
assert.equal(
    describeCorrespondenceError(
        new Error("Duplicate session for player secret-id: this identity is already in the room"),
    ),
    "RUN is still closing the previous connection. Return to Your Games and reopen this board in a moment.",
);
assert.equal(
    describeCorrespondenceError(new Error("Duplicate session for player secret-id")).includes("secret-id"),
    false,
    "connection errors never expose a player id",
);

console.log("online error copy checks passed");
