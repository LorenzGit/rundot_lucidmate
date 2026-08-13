#!/usr/bin/env node
import assert from "node:assert/strict";
import { describeJoinError } from "../src/game/chess/joinErrors.ts";

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

console.log("online error copy checks passed");
