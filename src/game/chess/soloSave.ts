import type { AiDifficulty } from "./ai.ts";
import type { ChessMatch } from "./game.ts";
import { boardToWire, type WireBoard, wireToBoard } from "./protocol.ts";
import type { CastlingRights, Color, GameStatus, Move, PieceType } from "./types.ts";

const PIECES: readonly PieceType[] = ["p", "n", "b", "r", "q", "k"];
const MAX_HISTORY = 512;

export interface SavedSoloMatch {
    opponent: "ai" | "local";
    difficulty: AiDifficulty;
    playerColor: Color;
    board: WireBoard;
    turn: Color;
    castling: CastlingRights;
    epTarget: number | null;
    status: GameStatus;
    lastMove: Move | null;
    halfmoveClock: number;
    fullmoveNumber: number;
    history: Move[];
    captures: number;
    checksGiven: number;
    pendingPromotion: { from: number; to: number } | null;
    updatedAt: number;
}

const DIFFICULTY_LABEL: Record<AiDifficulty, string> = {
    chill: "Easy",
    trippy: "Standard",
    cosmic: "Expert",
};

function integer(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function square(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 64 ? value : null;
}

function pieceType(value: unknown): PieceType | null {
    return typeof value === "string" && PIECES.includes(value as PieceType) ? (value as PieceType) : null;
}

function color(value: unknown): Color | null {
    return value === "w" || value === "b" ? value : null;
}

function sanitizeMove(value: unknown): Move | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<Move>;
    const from = square(candidate.from);
    const to = square(candidate.to);
    const piece = pieceType(candidate.piece);
    const side = color(candidate.color);
    if (from == null || to == null || !piece || !side) return null;
    const capture = candidate.capture == null ? null : pieceType(candidate.capture);
    if (candidate.capture != null && capture == null) return null;
    const promotion = candidate.promotion == null ? null : pieceType(candidate.promotion);
    if (candidate.promotion != null && promotion == null) return null;
    return {
        from,
        to,
        piece,
        color: side,
        capture,
        promotion,
        flags: typeof candidate.flags === "string" ? candidate.flags.slice(0, 4) : "",
    };
}

function sanitizeCastling(value: unknown): CastlingRights {
    const candidate = value && typeof value === "object" ? (value as Partial<CastlingRights>) : {};
    return {
        wK: candidate.wK === true,
        wQ: candidate.wQ === true,
        bK: candidate.bK === true,
        bQ: candidate.bQ === true,
    };
}

function boardHasKings(board: WireBoard): boolean {
    if (board.length !== 64) return false;
    let white = false;
    let black = false;
    for (const square of board) {
        if (!square) continue;
        if (square.t === "k" && square.c === "w") white = true;
        if (square.t === "k" && square.c === "b") black = true;
    }
    return white && black;
}

export function serializeSoloMatch(match: ChessMatch, now = Date.now()): SavedSoloMatch | null {
    if (match.config.opponent === "online") return null;
    if (match.isOver()) return null;
    const snap = match.snapshot();
    return {
        opponent: match.config.opponent,
        difficulty: match.config.difficulty,
        playerColor: match.config.playerColor,
        board: boardToWire(snap.board),
        turn: snap.turn,
        castling: snap.castling,
        epTarget: snap.epTarget,
        status: snap.status === "check" ? "check" : "playing",
        lastMove: snap.lastMove,
        halfmoveClock: snap.halfmoveClock,
        fullmoveNumber: snap.fullmoveNumber,
        history: snap.history.slice(-MAX_HISTORY),
        captures: snap.captures,
        checksGiven: snap.checksGiven,
        pendingPromotion: snap.pendingPromotion,
        updatedAt: now,
    };
}

export function sanitizeSoloMatch(value: unknown): SavedSoloMatch | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<SavedSoloMatch>;
    if (candidate.opponent !== "ai" && candidate.opponent !== "local") return null;
    const difficulty =
        candidate.difficulty === "chill" || candidate.difficulty === "trippy" || candidate.difficulty === "cosmic"
            ? candidate.difficulty
            : null;
    const playerColor = color(candidate.playerColor);
    const turn = color(candidate.turn);
    if (!difficulty || !playerColor || !turn) return null;
    if (!Array.isArray(candidate.board) || !boardHasKings(candidate.board as WireBoard)) return null;
    const status: GameStatus = candidate.status === "check" ? "check" : "playing";
    const pendingFrom = square(candidate.pendingPromotion?.from);
    const pendingTo = square(candidate.pendingPromotion?.to);
    const history = Array.isArray(candidate.history)
        ? candidate.history
              .map(sanitizeMove)
              .filter((move): move is Move => move !== null)
              .slice(-MAX_HISTORY)
        : [];
    const restored = wireToBoard(candidate.board as WireBoard);
    if (restored.length !== 64) return null;
    return {
        opponent: candidate.opponent,
        difficulty,
        playerColor,
        board: candidate.board as WireBoard,
        turn,
        castling: sanitizeCastling(candidate.castling),
        epTarget: candidate.epTarget == null ? null : square(candidate.epTarget),
        status,
        lastMove: sanitizeMove(candidate.lastMove),
        halfmoveClock: integer(candidate.halfmoveClock),
        fullmoveNumber: Math.max(1, integer(candidate.fullmoveNumber, 1)),
        history,
        captures: integer(candidate.captures),
        checksGiven: integer(candidate.checksGiven),
        pendingPromotion: pendingFrom == null || pendingTo == null ? null : { from: pendingFrom, to: pendingTo },
        updatedAt: integer(candidate.updatedAt, Date.now()),
    };
}

export function soloResumeCopy(saved: SavedSoloMatch): { kicker: string; title: string; detail: string } {
    const moves = saved.history.length;
    const moveLabel = moves === 1 ? "1 move" : `${moves} moves`;
    const side = saved.turn === "w" ? "White" : "Black";
    const turn = saved.status === "check" ? `${side} in check` : `${side} to move`;
    if (saved.opponent === "local") {
        return {
            kicker: "BOARD SAVED",
            title: "Continue pass & play",
            detail: moves ? `${moveLabel} · ${turn}` : turn,
        };
    }
    return {
        kicker: "BOARD SAVED",
        title: "Continue your game",
        detail: `${DIFFICULTY_LABEL[saved.difficulty]} · ${moves ? `${moveLabel} · ` : ""}${turn}`,
    };
}
