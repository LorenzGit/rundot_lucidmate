#!/usr/bin/env node
import assert from "node:assert/strict";
import { ChessMatch } from "../src/game/chess/game.ts";
import { sanitizeSoloMatch, serializeSoloMatch, soloResumeCopy } from "../src/game/chess/soloSave.ts";

const match = new ChessMatch({ playerColor: "w", opponent: "ai", difficulty: "trippy" });
const select = match.tapSquare(12);
assert.equal(select.kind, "select", "e2 selected");
const moved = match.tapSquare(28);
assert.equal(moved.kind, "move", "e2-e4 played");

const saved = serializeSoloMatch(match);
assert.ok(saved, "unfinished solo match serializes");
assert.equal(saved?.opponent, "ai");
assert.equal(saved?.turn, "b");
assert.equal(saved?.history.length, 1);
assert.equal(saved?.lastMove?.from, 12);
assert.equal(saved?.lastMove?.to, 28);

const restored = sanitizeSoloMatch(saved);
assert.ok(restored, "serialized match survives sanitizer");
if (!restored) throw new Error("expected restored match");
const copy = new ChessMatch({ playerColor: "b", opponent: "local", difficulty: "chill" });
copy.hydrateSaved(restored);
const snap = copy.snapshot();
assert.equal(snap.config.opponent, "ai");
assert.equal(snap.config.difficulty, "trippy");
assert.equal(snap.config.playerColor, "w");
assert.equal(snap.turn, "b");
assert.equal(snap.history.length, 1);
assert.equal(snap.board[28]?.type, "p");
assert.equal(snap.board[28]?.color, "w");
assert.equal(snap.board[12], null);

const copyText = soloResumeCopy(restored);
assert.equal(copyText.kicker, "BOARD SAVED");
assert.equal(copyText.title, "Continue your game");
assert.match(copyText.detail, /Standard/);
assert.match(copyText.detail, /1 move/);
assert.match(copyText.detail, /Black to move/);
assert.doesNotMatch(copyText.detail, /1 moves/);

assert.equal(sanitizeSoloMatch(null), null);
assert.equal(sanitizeSoloMatch({ opponent: "online" }), null);
assert.equal(sanitizeSoloMatch({ ...saved, board: [] }), null);

match.playAi(() => 0);
const over = new ChessMatch({ playerColor: "w", opponent: "ai", difficulty: "chill" });
assert.equal(serializeSoloMatch(over)?.history.length, 0, "opening still saves if they leave immediately");

console.log("solo save checks passed");
