#!/usr/bin/env node
import assert from "node:assert/strict";
import { describeCorrespondenceError, describeJoinError } from "../src/game/chess/joinErrors.ts";

assert.equal(
    describeJoinError(new Error("duplicate session: player already connected")),
    "You’re already connected to this board. To test both sides, join from a different RUN account.",
);
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

console.log("online error copy checks passed");
