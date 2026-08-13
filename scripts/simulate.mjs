#!/usr/bin/env node
/**
 * Headless proof for LUCIDMATE chess rules.
 * Node 22+ strips types on import — no Pixi/React required.
 */
import process from "node:process";
import { startingBoard, fullCastling, findKing } from "../src/game/chess/board.ts";
import { generateLegalMoves, applyMove, inCheck, isSquareAttacked } from "../src/game/chess/moves.ts";
import { ChessMatch } from "../src/game/chess/game.ts";
import { pickAiMove, evaluate } from "../src/game/chess/ai.ts";
import { NoiseRandom } from "../src/game/noiseRandom.ts";

let failures = 0;

function assert(cond, msg) {
    if (!cond) {
        failures += 1;
        console.error("FAIL:", msg);
    }
}

// Starting position has 20 legal moves for white
{
    const board = startingBoard();
    const legal = generateLegalMoves(board, "w", fullCastling(), null);
    assert(legal.length === 20, `start position should have 20 moves, got ${legal.length}`);
}

// Kings present
{
    const board = startingBoard();
    assert(findKing(board, "w") === 4, "white king on e1");
    assert(findKing(board, "b") === 60, "black king on e8");
}

// Scholar's mate path ends in checkmate
{
    const match = new ChessMatch({ playerColor: "w", opponent: "local", difficulty: "chill" });
    // 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
    const script = [
        [12, 28], // e2-e4
        [52, 36], // e7-e5
        [3, 39], // Qd1-h5
        [57, 42], // Nb8-c6
        [5, 26], // Bf1-c4
        [62, 45], // Ng8-f6
        [39, 53], // Qh5xf7#
    ];
    for (const [from, to] of script) {
        const sel = match.tapSquare(from);
        assert(sel.kind === "select", `select ${from} got ${sel.kind}`);
        const mv = match.tapSquare(to);
        assert(mv.kind === "move", `move ${from}->${to} got ${mv.kind}`);
    }
    assert(match.isOver(), "scholars mate should end the game");
    assert(match.snapshot().status === "checkmate", `status checkmate got ${match.snapshot().status}`);
    const summary = match.summary();
    assert(summary?.playerWon === true, "white player won scholars mate");
}

// AI can play many plies without throwing
{
    const rng = new NoiseRandom(42);
    const match = new ChessMatch({ playerColor: "w", opponent: "local", difficulty: "chill" });
    let ply = 0;
    while (!match.isOver() && ply < 30) {
        const snap = match.snapshot();
        const move = pickAiMove(snap.board, snap.castling, snap.epTarget, snap.turn, "chill", () => rng.nextDouble());
        assert(move !== null, `AI found a move at ply ${ply}`);
        if (!move) break;
        match.tapSquare(move.from);
        const res = match.tapSquare(move.to);
        if (res.kind === "need-promotion") {
            match.promote("q");
        } else {
            assert(res.kind === "move", `ply ${ply} move applied (${res.kind})`);
        }
        ply += 1;
    }
    assert(ply > 0, "played at least one ply");
    const end = match.snapshot();
    const score = evaluate(end.board, end.turn);
    assert(Number.isFinite(score), "evaluate finite");
}

// Open e-file: a black rook on e8 attacks white king on e1
{
    const board = startingBoard();
    for (let r = 1; r < 7; r++) board[r * 8 + 4] = null;
    board[60] = { color: "b", type: "r" }; // replace king with rook for this unit check
    assert(isSquareAttacked(board, 4, "b") === true, "e-file open, black rook attacks e1");
}

// In check detection on starting pos is false
{
    assert(inCheck(startingBoard(), "w") === false, "white not in check at start");
}

// Apply move mutates correctly (pawn double push sets ep)
{
    const board = startingBoard();
    const move = generateLegalMoves(board, "w", fullCastling(), null).find((m) => m.from === 12 && m.to === 28);
    assert(!!move, "e2e4 exists");
    const next = applyMove(board, fullCastling(), move);
    assert(next.board[28]?.type === "p", "pawn on e4");
    assert(next.board[12] === null, "e2 empty");
    assert(next.epTarget === 20, `ep target e3 got ${next.epTarget}`);
}

if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
}
console.log("simulate: all chess rule checks passed");
