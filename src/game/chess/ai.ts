/**
 * Compact alpha-beta AI. Depth 1–3 by difficulty; material + piece-square tables.
 * Pure functions — safe for headless simulate scripts.
 */
import { generateLegalMoves, applyMove, inCheck } from "./moves.ts";
import type { Board, CastlingRights, Color, Move, PieceType } from "./types.ts";
import { opposite } from "./types.ts";

const MATERIAL: Record<PieceType, number> = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000,
};

// Midgame PST, white perspective (rank 0 at bottom). Black mirrors.
const PST: Record<PieceType, number[]> = {
    p: [
        0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5,
        5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0,
        0,
    ],
    n: [
        -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5,
        15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0,
        -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
    ],
    b: [
        -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10,
        10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10,
        -20, -10, -10, -10, -10, -10, -10, -20,
    ],
    r: [
        0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0,
        0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
    ],
    q: [
        -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5,
        0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5,
        -10, -10, -20,
    ],
    k: [
        -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40,
        -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20,
        -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
    ],
};

function pst(type: PieceType, sq: number, color: Color): number {
    const table = PST[type];
    const idx = color === "w" ? sq : ((7 - (sq >> 3)) << 3) + (sq & 7);
    return table[idx] ?? 0;
}

export function evaluate(board: Board, sideToMove: Color): number {
    let score = 0;
    for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p) continue;
        const value = MATERIAL[p.type] + pst(p.type, sq, p.color);
        score += p.color === "w" ? value : -value;
    }
    // Slight tempo bonus for side to move
    score += sideToMove === "w" ? 10 : -10;
    return score;
}

function orderMoves(moves: Move[]): Move[] {
    return [...moves].sort((a, b) => {
        const capA = a.capture ? MATERIAL[a.capture] : 0;
        const capB = b.capture ? MATERIAL[b.capture] : 0;
        const promoA = a.promotion ? MATERIAL[a.promotion] : 0;
        const promoB = b.promotion ? MATERIAL[b.promotion] : 0;
        return capB + promoB - (capA + promoA);
    });
}

function minimax(
    board: Board,
    castling: CastlingRights,
    epTarget: number | null,
    color: Color,
    depth: number,
    alpha: number,
    beta: number,
    maximizing: boolean,
): number {
    if (depth === 0) return evaluate(board, color);

    const moves = generateLegalMoves(board, color, castling, epTarget);
    if (moves.length === 0) {
        if (inCheck(board, color)) {
            // Checkmate: worse the sooner it happens
            return maximizing ? -100000 - depth : 100000 + depth;
        }
        return 0; // stalemate
    }

    const ordered = orderMoves(moves);
    if (maximizing) {
        let best = -Infinity;
        for (const move of ordered) {
            const next = applyMove(board, castling, move);
            const score = minimax(
                next.board,
                next.castling,
                next.epTarget,
                opposite(color),
                depth - 1,
                alpha,
                beta,
                false,
            );
            best = Math.max(best, score);
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
        }
        return best;
    }

    let best = Infinity;
    for (const move of ordered) {
        const next = applyMove(board, castling, move);
        const score = minimax(next.board, next.castling, next.epTarget, opposite(color), depth - 1, alpha, beta, true);
        best = Math.min(best, score);
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
    }
    return best;
}

export type AiDifficulty = "chill" | "trippy" | "cosmic";

export function depthForDifficulty(d: AiDifficulty): number {
    if (d === "chill") return 1;
    if (d === "trippy") return 2;
    return 3;
}

/**
 * Pick the best move for `color`. When several moves score equally, prefer
 * captures and checks so the AI feels alive rather than sleepy.
 */
export function pickAiMove(
    board: Board,
    castling: CastlingRights,
    epTarget: number | null,
    color: Color,
    difficulty: AiDifficulty,
    rng: () => number = () => 0.5,
): Move | null {
    const depth = depthForDifficulty(difficulty);
    const legal = generateLegalMoves(board, color, castling, epTarget);
    if (legal.length === 0) return null;

    const ordered = orderMoves(legal);
    const maximizing = color === "w";
    let bestScore = maximizing ? -Infinity : Infinity;
    const candidates: Move[] = [];

    for (const move of ordered) {
        const next = applyMove(board, castling, move);
        const score = minimax(
            next.board,
            next.castling,
            next.epTarget,
            opposite(color),
            depth - 1,
            -Infinity,
            Infinity,
            !maximizing,
        );
        // Tiny noise so equal lines don't always pick the same move
        const jitter = (rng() - 0.5) * 4;
        const adjusted = score + jitter;
        if (maximizing) {
            if (adjusted > bestScore + 0.01) {
                bestScore = adjusted;
                candidates.length = 0;
                candidates.push(move);
            } else if (Math.abs(adjusted - bestScore) < 8) {
                candidates.push(move);
            }
        } else {
            if (adjusted < bestScore - 0.01) {
                bestScore = adjusted;
                candidates.length = 0;
                candidates.push(move);
            } else if (Math.abs(adjusted - bestScore) < 8) {
                candidates.push(move);
            }
        }
    }

    if (candidates.length === 0) return ordered[0] ?? null;
    return candidates[Math.floor(rng() * candidates.length)] ?? candidates[0]!;
}
