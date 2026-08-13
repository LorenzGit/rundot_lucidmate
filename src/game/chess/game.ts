/**
 * Chess match state machine. Renderer-free: the scene mirrors this, never owns it.
 */
import { pickAiMove, type AiDifficulty } from "./ai.ts";
import { cloneBoard, cloneCastling, fullCastling, startingBoard } from "./board.ts";
import { applyMove, generateLegalMoves, inCheck, findMove, movesFrom } from "./moves.ts";
import {
    type Board,
    type CastlingRights,
    type Color,
    type GameStatus,
    type MatchSummary,
    type Move,
    type PieceType,
    opposite,
} from "./types.ts";

export type OpponentMode = "ai" | "local" | "online";

export interface MatchConfig {
    /** Color the human controls when opponent is AI/online. Local is always both. */
    playerColor: Color;
    opponent: OpponentMode;
    difficulty: AiDifficulty;
}

/** Authoritative fields applied from the multiplayer GameRoom. */
export interface AuthoritativeMatchState {
    board: Board;
    turn: Color;
    castling: CastlingRights;
    epTarget: number | null;
    status: GameStatus;
    lastMove: Move | null;
    /** When set (online seat assigned), overrides config.playerColor. */
    playerColor?: Color;
    moveCount?: number;
    captureCount?: number;
    checkCount?: number;
}

export interface MatchSnapshot {
    board: Board;
    turn: Color;
    castling: CastlingRights;
    epTarget: number | null;
    status: GameStatus;
    selected: number | null;
    legalTargets: number[];
    lastMove: Move | null;
    halfmoveClock: number;
    fullmoveNumber: number;
    history: Move[];
    captures: number;
    checksGiven: number;
    config: MatchConfig;
    /** True when it's the AI's turn and a think is in progress. */
    thinking: boolean;
    pendingPromotion: { from: number; to: number } | null;
}

export class ChessMatch {
    private board: Board;
    private turn: Color;
    private castling: CastlingRights;
    private epTarget: number | null;
    private status: GameStatus = "playing";
    private selected: number | null = null;
    private legalTargets: number[] = [];
    private lastMove: Move | null = null;
    private halfmoveClock = 0;
    private fullmoveNumber = 1;
    private history: Move[] = [];
    private captures = 0;
    private checksGiven = 0;
    private thinking = false;
    private pendingPromotion: { from: number; to: number } | null = null;
    /** Online: true while waiting for opponent / reconnect — blocks input. */
    private interactionLocked = false;
    readonly config: MatchConfig;
    private undoStack: Array<{
        board: Board;
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
    }> = [];

    constructor(config: MatchConfig) {
        this.config = config;
        this.board = startingBoard();
        this.turn = "w";
        this.castling = fullCastling();
        this.epTarget = null;
        this.refreshStatus();
    }

    snapshot(): MatchSnapshot {
        return {
            board: cloneBoard(this.board),
            turn: this.turn,
            castling: cloneCastling(this.castling),
            epTarget: this.epTarget,
            status: this.status,
            selected: this.selected,
            legalTargets: [...this.legalTargets],
            lastMove: this.lastMove,
            halfmoveClock: this.halfmoveClock,
            fullmoveNumber: this.fullmoveNumber,
            history: [...this.history],
            captures: this.captures,
            checksGiven: this.checksGiven,
            config: this.config,
            thinking: this.thinking,
            pendingPromotion: this.pendingPromotion,
        };
    }

    private isPlayerTurn(): boolean {
        if (this.interactionLocked) return false;
        if (this.config.opponent === "local") return true;
        return this.turn === this.config.playerColor;
    }

    setInteractionLocked(locked: boolean): void {
        this.interactionLocked = locked;
        if (locked) {
            this.selected = null;
            this.legalTargets = [];
            this.pendingPromotion = null;
        }
    }

    /** Online / external seat assignment (e.g. second joiner is black). */
    setPlayerColor(color: Color): void {
        (this.config as { playerColor: Color }).playerColor = color;
    }

    /**
     * Apply a server-authoritative snapshot. Clears selection/pending promo.
     * Returns the previous lastMove so the scene can animate opponent replies.
     */
    applyAuthoritative(state: AuthoritativeMatchState): { previousLast: Move | null; nextLast: Move | null } {
        const previousLast = this.lastMove;
        this.board = cloneBoard(state.board);
        this.turn = state.turn;
        this.castling = cloneCastling(state.castling);
        this.epTarget = state.epTarget;
        this.status = state.status;
        this.lastMove = state.lastMove;
        this.selected = null;
        this.legalTargets = [];
        this.pendingPromotion = null;
        this.thinking = false;
        if (state.playerColor) this.setPlayerColor(state.playerColor);
        if (typeof state.captureCount === "number") this.captures = Math.max(0, state.captureCount | 0);
        if (typeof state.checkCount === "number") this.checksGiven = Math.max(0, state.checkCount | 0);
        // Recompute terminal status from board if server said "playing" but we are mated
        // (defensive — server already owns this).
        if (this.status === "playing" || this.status === "check") this.refreshStatus();
        if (state.lastMove) {
            // Keep a minimal history so HUD move count isn't stuck at 0.
            if (this.history.length === 0 || this.history[this.history.length - 1] !== state.lastMove) {
                // Don't double-count if same move rebroadcast
                const last = this.history[this.history.length - 1];
                if (!last || last.from !== state.lastMove.from || last.to !== state.lastMove.to) {
                    this.history.push(state.lastMove);
                    if (state.lastMove.capture) this.captures += 1;
                }
            }
        }
        if (typeof state.moveCount === "number" && state.moveCount > this.history.length) {
            const placeholder = state.lastMove ?? this.history[this.history.length - 1];
            if (placeholder) this.history = Array.from({ length: state.moveCount }, () => placeholder);
        }
        return { previousLast, nextLast: this.lastMove };
    }

    private legalMoves(): Move[] {
        return generateLegalMoves(this.board, this.turn, this.castling, this.epTarget);
    }

    private refreshStatus(): void {
        const legal = this.legalMoves();
        const check = inCheck(this.board, this.turn);
        if (legal.length === 0) {
            this.status = check ? "checkmate" : "stalemate";
            return;
        }
        if (this.halfmoveClock >= 100) {
            this.status = "draw";
            return;
        }
        this.status = check ? "check" : "playing";
    }

    private pushUndo(): void {
        this.undoStack.push({
            board: cloneBoard(this.board),
            turn: this.turn,
            castling: cloneCastling(this.castling),
            epTarget: this.epTarget,
            status: this.status,
            lastMove: this.lastMove,
            halfmoveClock: this.halfmoveClock,
            fullmoveNumber: this.fullmoveNumber,
            history: [...this.history],
            captures: this.captures,
            checksGiven: this.checksGiven,
        });
        // Cap stack so a long trip doesn't balloon memory
        if (this.undoStack.length > 64) this.undoStack.shift();
    }

    /** Undo the last ply (and the AI reply if the last human move was answered). */
    undo(): boolean {
        if (this.config.opponent === "online") return false;
        if (this.undoStack.length === 0) return false;
        if (this.status === "checkmate" || this.status === "stalemate" || this.status === "draw") {
            // Still allow undoing a finished game.
        }
        const snap = this.undoStack.pop()!;
        this.board = snap.board;
        this.turn = snap.turn;
        this.castling = snap.castling;
        this.epTarget = snap.epTarget;
        this.status = snap.status;
        this.lastMove = snap.lastMove;
        this.halfmoveClock = snap.halfmoveClock;
        this.fullmoveNumber = snap.fullmoveNumber;
        this.history = snap.history;
        this.captures = snap.captures;
        this.checksGiven = snap.checksGiven;
        this.selected = null;
        this.legalTargets = [];
        this.pendingPromotion = null;
        this.thinking = false;
        this.refreshStatus();
        return true;
    }

    canUndo(): boolean {
        if (this.config.opponent === "online") return false;
        return this.undoStack.length > 0;
    }

    /**
     * Tap a square. Returns a description of what happened so the scene can juice it.
     */
    tapSquare(sq: number): {
        kind: "select" | "deselect" | "move" | "illegal" | "need-promotion" | "ignored";
        move?: Move;
    } {
        if (this.status === "checkmate" || this.status === "stalemate" || this.status === "draw") {
            return { kind: "ignored" };
        }
        if (this.thinking || this.pendingPromotion) return { kind: "ignored" };
        if (!this.isPlayerTurn()) return { kind: "ignored" };

        if (this.selected === null) {
            const piece = this.board[sq];
            if (!piece || piece.color !== this.turn) return { kind: "illegal" };
            const targets = movesFrom(this.board, this.turn, this.castling, this.epTarget, sq);
            if (targets.length === 0) return { kind: "illegal" };
            this.selected = sq;
            this.legalTargets = targets.map((m) => m.to);
            return { kind: "select" };
        }

        if (this.selected === sq) {
            this.selected = null;
            this.legalTargets = [];
            return { kind: "deselect" };
        }

        // Re-select own piece
        const reselect = this.board[sq];
        if (reselect && reselect.color === this.turn) {
            const targets = movesFrom(this.board, this.turn, this.castling, this.epTarget, sq);
            if (targets.length === 0) {
                this.selected = null;
                this.legalTargets = [];
                return { kind: "illegal" };
            }
            this.selected = sq;
            this.legalTargets = targets.map((m) => m.to);
            return { kind: "select" };
        }

        const from = this.selected;
        const legal = movesFrom(this.board, this.turn, this.castling, this.epTarget, from);
        const promotions = legal.filter((m) => m.to === sq && m.promotion);
        if (promotions.length > 1) {
            this.pendingPromotion = { from, to: sq };
            this.selected = null;
            this.legalTargets = [];
            return { kind: "need-promotion" };
        }

        const move = findMove(legal, from, sq, promotions[0]?.promotion ?? null);
        if (!move) {
            this.selected = null;
            this.legalTargets = [];
            return { kind: "illegal" };
        }

        this.pushUndo();
        this.commitMove(move);
        return { kind: "move", move };
    }

    promote(choice: PieceType): { kind: "move" | "ignored"; move?: Move } {
        if (!this.pendingPromotion) return { kind: "ignored" };
        const { from, to } = this.pendingPromotion;
        const legal = movesFrom(this.board, this.turn, this.castling, this.epTarget, from);
        const move = findMove(legal, from, to, choice);
        if (!move) return { kind: "ignored" };
        this.pendingPromotion = null;
        this.pushUndo();
        this.commitMove(move);
        return { kind: "move", move };
    }

    private commitMove(move: Move): void {
        const applied = applyMove(this.board, this.castling, move);
        this.board = applied.board;
        this.castling = applied.castling;
        this.epTarget = applied.epTarget;
        this.lastMove = move;
        this.history.push(move);
        if (move.capture || move.piece === "p") this.halfmoveClock = 0;
        else this.halfmoveClock += 1;
        if (move.capture) this.captures += 1;
        if (this.turn === "b") this.fullmoveNumber += 1;
        this.turn = opposite(this.turn);
        this.selected = null;
        this.legalTargets = [];
        this.refreshStatus();
        if (this.status === "check") this.checksGiven += 1;
    }

    /** Run one AI ply. Call when it's the AI's turn. */
    playAi(rng: () => number = () => 0.5): Move | null {
        if (this.config.opponent !== "ai") return null;
        if (this.turn === this.config.playerColor) return null;
        if (this.status === "checkmate" || this.status === "stalemate" || this.status === "draw") return null;

        this.thinking = true;
        const move = pickAiMove(this.board, this.castling, this.epTarget, this.turn, this.config.difficulty, rng);
        this.thinking = false;
        if (!move) {
            this.refreshStatus();
            return null;
        }
        // AI move shares undo with the human move that preceded it — we don't
        // push a second undo frame so one Undo reverses the whole exchange.
        this.commitMove(move);
        return move;
    }

    /** A simple material-blind legal "hint" move for the player. */
    hintMove(): Move | null {
        if (!this.isPlayerTurn()) return null;
        const legal = this.legalMoves();
        if (legal.length === 0) return null;
        // Prefer captures, then checks, then first legal
        const captures = legal.filter((m) => m.capture);
        if (captures.length > 0) return captures[0]!;
        for (const m of legal) {
            const next = applyMove(this.board, this.castling, m);
            if (inCheck(next.board, opposite(this.turn))) return m;
        }
        return legal[0]!;
    }

    isOver(): boolean {
        return this.status === "checkmate" || this.status === "stalemate" || this.status === "draw";
    }

    summary(): MatchSummary | null {
        if (!this.isOver()) return null;
        const playerColor = this.config.playerColor;
        let winner: Color | null = null;
        let result: "win" | "loss" | "draw" = "draw";
        let playerWon = false;

        if (this.status === "checkmate") {
            // Side to move is mated, so opposite wins
            winner = opposite(this.turn);
            playerWon = winner === playerColor;
            result = playerWon ? "win" : "loss";
        } else {
            result = "draw";
            playerWon = false;
        }

        const base = result === "win" ? 40 : result === "draw" ? 18 : 8;
        const aurasEarned = base + this.captures * 2 + Math.min(20, this.checksGiven * 3);

        return {
            status: this.status,
            winner,
            result,
            movesPlayed: this.history.length,
            captures: this.captures,
            checksGiven: this.checksGiven,
            aurasEarned,
            playerWon,
        };
    }
}
