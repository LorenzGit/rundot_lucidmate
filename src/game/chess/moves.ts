/**
 * Pseudo-legal + legal move generation for standard chess.
 * Handles castling, en passant, promotion, check filtering.
 */
import { cloneBoard, cloneCastling, findKing } from "./board.ts";
import {
    type Board,
    type CastlingRights,
    type Color,
    type Move,
    type PieceType,
    fileOf,
    opposite,
    rankOf,
    square,
} from "./types.ts";

const KNIGHT_DELTAS: ReadonlyArray<readonly [number, number]> = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
];

const KING_DELTAS: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
];

const BISHOP_DIRS: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
];

const ROOK_DIRS: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];

function onBoard(file: number, rank: number): boolean {
    return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function pushMove(
    list: Move[],
    from: number,
    to: number,
    piece: PieceType,
    color: Color,
    capture: PieceType | null,
    flags = "",
    promotion: PieceType | null = null,
): void {
    list.push({ from, to, piece, color, capture, promotion, flags });
}

/** Is `sq` attacked by `byColor`? */
export function isSquareAttacked(board: Board, sq: number, byColor: Color): boolean {
    const tf = fileOf(sq);
    const tr = rankOf(sq);

    // Pawns (attack toward us from their forward direction)
    const pawnDir = byColor === "w" ? -1 : 1; // from attacker's perspective, reverse
    for (const df of [-1, 1]) {
        const f = tf + df;
        const r = tr + pawnDir;
        if (!onBoard(f, r)) continue;
        const p = board[square(f, r)];
        if (p && p.color === byColor && p.type === "p") return true;
    }

    for (const [df, dr] of KNIGHT_DELTAS) {
        const f = tf + df;
        const r = tr + dr;
        if (!onBoard(f, r)) continue;
        const p = board[square(f, r)];
        if (p && p.color === byColor && p.type === "n") return true;
    }

    for (const [df, dr] of KING_DELTAS) {
        const f = tf + df;
        const r = tr + dr;
        if (!onBoard(f, r)) continue;
        const p = board[square(f, r)];
        if (p && p.color === byColor && p.type === "k") return true;
    }

    for (const [df, dr] of BISHOP_DIRS) {
        let f = tf + df;
        let r = tr + dr;
        while (onBoard(f, r)) {
            const p = board[square(f, r)];
            if (p) {
                if (p.color === byColor && (p.type === "b" || p.type === "q")) return true;
                break;
            }
            f += df;
            r += dr;
        }
    }

    for (const [df, dr] of ROOK_DIRS) {
        let f = tf + df;
        let r = tr + dr;
        while (onBoard(f, r)) {
            const p = board[square(f, r)];
            if (p) {
                if (p.color === byColor && (p.type === "r" || p.type === "q")) return true;
                break;
            }
            f += df;
            r += dr;
        }
    }

    return false;
}

export function inCheck(board: Board, color: Color): boolean {
    const king = findKing(board, color);
    if (king < 0) return true;
    return isSquareAttacked(board, king, opposite(color));
}

function generatePseudoLegal(board: Board, color: Color, castling: CastlingRights, epTarget: number | null): Move[] {
    const moves: Move[] = [];
    const forward = color === "w" ? 1 : -1;
    const startRank = color === "w" ? 1 : 6;
    const promoRank = color === "w" ? 7 : 0;

    for (let from = 0; from < 64; from++) {
        const piece = board[from];
        if (!piece || piece.color !== color) continue;
        const f = fileOf(from);
        const r = rankOf(from);

        if (piece.type === "p") {
            const oneR = r + forward;
            if (onBoard(f, oneR) && !board[square(f, oneR)]) {
                const to = square(f, oneR);
                if (oneR === promoRank) {
                    for (const promo of ["q", "r", "b", "n"] as PieceType[]) {
                        pushMove(moves, from, to, "p", color, null, "p", promo);
                    }
                } else {
                    pushMove(moves, from, to, "p", color, null);
                    if (r === startRank) {
                        const twoR = r + 2 * forward;
                        if (onBoard(f, twoR) && !board[square(f, twoR)]) {
                            pushMove(moves, from, square(f, twoR), "p", color, null);
                        }
                    }
                }
            }
            for (const df of [-1, 1]) {
                const cf = f + df;
                const cr = r + forward;
                if (!onBoard(cf, cr)) continue;
                const to = square(cf, cr);
                const target = board[to];
                if (target && target.color !== color) {
                    if (cr === promoRank) {
                        for (const promo of ["q", "r", "b", "n"] as PieceType[]) {
                            pushMove(moves, from, to, "p", color, target.type, "p", promo);
                        }
                    } else {
                        pushMove(moves, from, to, "p", color, target.type);
                    }
                } else if (epTarget === to) {
                    pushMove(moves, from, to, "p", color, "p", "e");
                }
            }
            continue;
        }

        if (piece.type === "n") {
            for (const [df, dr] of KNIGHT_DELTAS) {
                const tf = f + df;
                const tr = r + dr;
                if (!onBoard(tf, tr)) continue;
                const to = square(tf, tr);
                const target = board[to];
                if (!target || target.color !== color) {
                    pushMove(moves, from, to, "n", color, target?.type ?? null);
                }
            }
            continue;
        }

        if (piece.type === "k") {
            for (const [df, dr] of KING_DELTAS) {
                const tf = f + df;
                const tr = r + dr;
                if (!onBoard(tf, tr)) continue;
                const to = square(tf, tr);
                const target = board[to];
                if (!target || target.color !== color) {
                    pushMove(moves, from, to, "k", color, target?.type ?? null);
                }
            }
            // Castling
            if (!inCheck(board, color)) {
                if (color === "w") {
                    if (castling.wK && !board[square(5, 0)] && !board[square(6, 0)]) {
                        if (
                            !isSquareAttacked(board, square(5, 0), "b") &&
                            !isSquareAttacked(board, square(6, 0), "b")
                        ) {
                            pushMove(moves, from, square(6, 0), "k", color, null, "K");
                        }
                    }
                    if (castling.wQ && !board[square(1, 0)] && !board[square(2, 0)] && !board[square(3, 0)]) {
                        if (
                            !isSquareAttacked(board, square(2, 0), "b") &&
                            !isSquareAttacked(board, square(3, 0), "b")
                        ) {
                            pushMove(moves, from, square(2, 0), "k", color, null, "Q");
                        }
                    }
                } else {
                    if (castling.bK && !board[square(5, 7)] && !board[square(6, 7)]) {
                        if (
                            !isSquareAttacked(board, square(5, 7), "w") &&
                            !isSquareAttacked(board, square(6, 7), "w")
                        ) {
                            pushMove(moves, from, square(6, 7), "k", color, null, "K");
                        }
                    }
                    if (castling.bQ && !board[square(1, 7)] && !board[square(2, 7)] && !board[square(3, 7)]) {
                        if (
                            !isSquareAttacked(board, square(2, 7), "w") &&
                            !isSquareAttacked(board, square(3, 7), "w")
                        ) {
                            pushMove(moves, from, square(2, 7), "k", color, null, "Q");
                        }
                    }
                }
            }
            continue;
        }

        const dirs = piece.type === "b" ? BISHOP_DIRS : piece.type === "r" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
        for (const [df, dr] of dirs) {
            let tf = f + df;
            let tr = r + dr;
            while (onBoard(tf, tr)) {
                const to = square(tf, tr);
                const target = board[to];
                if (!target) {
                    pushMove(moves, from, to, piece.type, color, null);
                } else {
                    if (target.color !== color) {
                        pushMove(moves, from, to, piece.type, color, target.type);
                    }
                    break;
                }
                tf += df;
                tr += dr;
            }
        }
    }

    return moves;
}

export function applyMove(
    board: Board,
    castling: CastlingRights,
    move: Move,
): { board: Board; castling: CastlingRights; epTarget: number | null } {
    const next = cloneBoard(board);
    const rights = cloneCastling(castling);
    const piece = next[move.from];
    if (!piece) return { board: next, castling: rights, epTarget: null };

    next[move.from] = null;

    // En passant capture
    if (move.flags.includes("e")) {
        const capRank = move.color === "w" ? rankOf(move.to) - 1 : rankOf(move.to) + 1;
        next[square(fileOf(move.to), capRank)] = null;
    }

    // Castling rook hop
    if (move.flags.includes("K")) {
        if (move.color === "w") {
            next[square(7, 0)] = null;
            next[square(5, 0)] = { color: "w", type: "r" };
        } else {
            next[square(7, 7)] = null;
            next[square(5, 7)] = { color: "b", type: "r" };
        }
    } else if (move.flags.includes("Q")) {
        if (move.color === "w") {
            next[square(0, 0)] = null;
            next[square(3, 0)] = { color: "w", type: "r" };
        } else {
            next[square(0, 7)] = null;
            next[square(3, 7)] = { color: "b", type: "r" };
        }
    }

    const placed: typeof piece = move.promotion
        ? { color: move.color, type: move.promotion }
        : { color: piece.color, type: piece.type };
    next[move.to] = placed;

    // Update castling rights
    if (piece.type === "k") {
        if (move.color === "w") {
            rights.wK = false;
            rights.wQ = false;
        } else {
            rights.bK = false;
            rights.bQ = false;
        }
    }
    if (piece.type === "r") {
        if (move.color === "w") {
            if (move.from === square(0, 0)) rights.wQ = false;
            if (move.from === square(7, 0)) rights.wK = false;
        } else {
            if (move.from === square(0, 7)) rights.bQ = false;
            if (move.from === square(7, 7)) rights.bK = false;
        }
    }
    // Rook captured on its home square
    if (move.to === square(0, 0)) rights.wQ = false;
    if (move.to === square(7, 0)) rights.wK = false;
    if (move.to === square(0, 7)) rights.bQ = false;
    if (move.to === square(7, 7)) rights.bK = false;

    // En passant target after double pawn push
    let epTarget: number | null = null;
    if (piece.type === "p" && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
        epTarget = square(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) >> 1);
    }

    return { board: next, castling: rights, epTarget };
}

/** All legal moves for `color`. */
export function generateLegalMoves(
    board: Board,
    color: Color,
    castling: CastlingRights,
    epTarget: number | null,
): Move[] {
    const pseudo = generatePseudoLegal(board, color, castling, epTarget);
    const legal: Move[] = [];
    for (const move of pseudo) {
        const applied = applyMove(board, castling, move);
        if (!inCheck(applied.board, color)) legal.push(move);
    }
    return legal;
}

export function movesFrom(
    board: Board,
    color: Color,
    castling: CastlingRights,
    epTarget: number | null,
    from: number,
): Move[] {
    return generateLegalMoves(board, color, castling, epTarget).filter((m) => m.from === from);
}

export function findMove(legal: Move[], from: number, to: number, promotion: PieceType | null = null): Move | null {
    return (
        legal.find((m) => m.from === from && m.to === to && (promotion === null || m.promotion === promotion)) ?? null
    );
}
