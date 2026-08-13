/** Shared chess primitives — renderer-free, used by rules + AI + UI mirrors. */

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface Piece {
    color: Color;
    type: PieceType;
}

/** Square index 0–63. file = sq % 8 (0=a … 7=h), rank = floor(sq / 8) (0=white rank 1 … 7=rank 8). */
export type Square = number;

export type Board = (Piece | null)[];

export interface CastlingRights {
    wK: boolean;
    wQ: boolean;
    bK: boolean;
    bQ: boolean;
}

export interface Move {
    from: Square;
    to: Square;
    piece: PieceType;
    color: Color;
    capture: PieceType | null;
    promotion: PieceType | null;
    /** 'K'/'Q' for castling, 'e' en passant, 'p' promotion, '' normal. */
    flags: string;
}

export type GameStatus = "playing" | "check" | "checkmate" | "stalemate" | "draw";

export interface MatchSummary {
    status: GameStatus;
    winner: Color | null;
    result: "win" | "loss" | "draw";
    movesPlayed: number;
    captures: number;
    checksGiven: number;
    aurasEarned: number;
    /** True when the human played white and won (or black in reverse). */
    playerWon: boolean;
}

export function opposite(color: Color): Color {
    return color === "w" ? "b" : "w";
}

export function square(file: number, rank: number): Square {
    return rank * 8 + file;
}

export function fileOf(sq: Square): number {
    return sq & 7;
}

export function rankOf(sq: Square): number {
    return sq >> 3;
}

export function algebraic(sq: Square): string {
    return `${"abcdefgh"[fileOf(sq)]}${"12345678"[rankOf(sq)]}`;
}

export function parseAlgebraic(s: string): Square | null {
    if (s.length !== 2) return null;
    const file = "abcdefgh".indexOf(s[0]!);
    const rank = "12345678".indexOf(s[1]!);
    if (file < 0 || rank < 0) return null;
    return square(file, rank);
}
