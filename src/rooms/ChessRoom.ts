/**
 * Server-authoritative LUCIDMATE chess room.
 * Clients send move intents; server validates with the shared rules engine.
 */
import { GameRoom, type GameMessage, type LeaveReason, type Player } from "@series-inc/rundot-game-sdk/mp-server";
import { cloneCastling, fullCastling, startingBoard } from "../game/chess/board.ts";
import { applyMove, generateLegalMoves, findMove, inCheck } from "../game/chess/moves.ts";
import { boardToWire, type ChessProtocol, type ChessServerMessage, type WireBoard } from "../game/chess/protocol.ts";
import type { Board, CastlingRights, Color, GameStatus, Move, PieceType } from "../game/chess/types.ts";
import { opposite } from "../game/chess/types.ts";
import {
    type ChessReaction,
    type CorrespondencePace,
    CHESS_REACTIONS,
    isMatchKey,
    type RivalIdentity,
} from "../social/model.ts";

const DAY_MS = 86_400_000;
const REACTION_COOLDOWN_MS = 5_000;

export default class ChessRoom extends GameRoom<ChessProtocol> {
    private board: Board = startingBoard();
    private turn: Color = "w";
    private castling: CastlingRights = fullCastling();
    private ep: number | null = null;
    private status: GameStatus = "playing";
    private phase: "waiting" | "playing" | "over" = "waiting";
    private seats: { w: string | null; b: string | null } = { w: null, b: null };
    private lastMove: Move | null = null;
    private winner: Color | null = null;
    private reason: string | null = null;
    private halfmove = 0;
    private profiles: { w: RivalIdentity | null; b: RivalIdentity | null } = { w: null, b: null };
    private matchKey: string | null = null;
    private pace: CorrespondencePace | null = null;
    private deadlineAt: number | null = null;
    private updatedAt = Date.now();
    private moveCount = 0;
    private captureCount = 0;
    private checkCount = 0;
    private reaction: { id: ChessReaction; from: string; at: number } | null = null;
    private rematch: { matchKey: string; offeredBy: string } | null = null;

    private get correspondence(): boolean {
        return this.roomType === "lucidmate-correspondence";
    }

    onCreate(): void {
        this.log.info("chess room created", { roomId: this.roomId });
    }

    onPlayerJoin(player: Player): void {
        this.settleDeadline();
        let color = this.colorOf(player.id);
        if (!color && this.phase === "over") this.reject({ reason: "This match has ended" });
        if (!color && !this.correspondence) {
            if (!this.seats.w) color = "w";
            else if (!this.seats.b) color = "b";
            else this.reject({ reason: "This match already has two players" });
            this.seats[color] = player.id;
        }
        // Older code-based boards only reserved their creator. Preserve that
        // flow while new directory challenges arrive with both seats reserved.
        if (!color && this.correspondence && Boolean(this.seats.w) !== Boolean(this.seats.b)) {
            color = this.seats.w ? "b" : "w";
            this.seats[color] = player.id;
        }
        if (!color && (this.seats.w || this.seats.b))
            this.reject({ reason: "This board belongs to two other players" });
        if (color) this.profiles[color] = this.identity(player);

        this.beginWhenBothPlayersJoined(player.id);

        this.sendTo(player.id, this.stateMessage(player.id));
        // Let everyone know seats filled.
        this.broadcast(this.stateMessage(null));
        this.save();
    }

    onGameMessage(message: GameMessage<ChessProtocol>): void {
        const { sender, payload } = message;
        if (!sender.connected) return;

        this.settleDeadline();

        if (payload.type === "configure") {
            this.handleConfigure(sender.id, payload.matchKey, payload.pace, payload.challenger, payload.recipient);
            return;
        }
        if (payload.type === "react") {
            this.handleReaction(sender.id, payload.reaction);
            return;
        }
        if (payload.type === "rematch") {
            this.handleRematch(sender.id, payload.matchKey);
            return;
        }

        if (payload.type === "resign") {
            this.handleResign(sender.id);
            return;
        }
        if (payload.type === "ready") {
            this.sendTo(sender.id, this.stateMessage(sender.id));
            return;
        }
        if (payload.type !== "move") return;
        if (
            this.phase !== "playing" ||
            this.status === "checkmate" ||
            this.status === "stalemate" ||
            this.status === "draw"
        ) {
            this.sendTo(sender.id, { type: "error", reason: "Game is not in progress" });
            return;
        }

        const color = this.colorOf(sender.id);
        if (!color) {
            this.sendTo(sender.id, { type: "error", reason: "You are not seated" });
            return;
        }
        if (color !== this.turn) {
            this.sendTo(sender.id, { type: "error", reason: "Not your turn" });
            return;
        }

        const from = payload.from | 0;
        const to = payload.to | 0;
        if (from < 0 || from > 63 || to < 0 || to > 63) {
            this.sendTo(sender.id, { type: "error", reason: "Invalid square" });
            return;
        }

        const legal = generateLegalMoves(this.board, this.turn, this.castling, this.ep);
        const promo = payload.promotion ?? null;
        const move = findMove(legal, from, to, promo as PieceType | null);
        if (!move) {
            // If they omitted promotion but only one promo exists, or they need to pick
            const promos = legal.filter((m) => m.from === from && m.to === to && m.promotion);
            if (promos.length > 1 && !promo) {
                this.sendTo(sender.id, { type: "error", reason: "Promotion required" });
                return;
            }
            this.sendTo(sender.id, { type: "error", reason: "Illegal move" });
            return;
        }

        const applied = applyMove(this.board, this.castling, move);
        this.board = applied.board;
        this.castling = applied.castling;
        this.ep = applied.epTarget;
        this.lastMove = move;
        if (move.capture) this.captureCount += 1;
        if (move.capture || move.piece === "p") this.halfmove = 0;
        else this.halfmove += 1;

        this.turn = opposite(this.turn);
        this.moveCount += 1;
        this.updatedAt = this.now();
        this.deadlineAt = this.correspondence ? this.updatedAt + this.turnDurationMs() : null;
        // Recompute into a local — TS does not re-widen `this.status` across method calls.
        const ended = this.computeStatus();
        this.status = ended;
        if (ended === "check" || ended === "checkmate") this.checkCount += 1;

        if (ended === "checkmate") {
            this.phase = "over";
            this.winner = opposite(this.turn);
            this.reason = "checkmate";
        } else if (ended === "stalemate") {
            this.phase = "over";
            this.winner = null;
            this.reason = "stalemate";
        } else if (ended === "draw" || this.halfmove >= 100) {
            this.phase = "over";
            this.status = "draw";
            this.winner = null;
            this.reason = "draw";
        }

        this.broadcast(this.stateMessage(null));
        this.save();
        if (this.correspondence && this.phase === "playing") {
            const recipient = this.seats[this.turn];
            if (recipient) {
                const mover = this.profiles[opposite(this.turn)]?.username ?? "Your opponent";
                void this.notify(sender.id, recipient, "lucidmate_send_move_notification", { opponent: mover });
            }
        }
    }

    onPlayerLeave(player: Player, reason: LeaveReason): void {
        this.log.info("player left", { id: player.id, reason });
        if (this.phase === "over") return;
        if (this.correspondence) {
            this.save();
            return;
        }
        // Disconnect may reconnect — only forfeit on intentional leave / timeout after empty
        if (reason === "disconnect") {
            this.broadcast({ type: "info", message: `${player.username} disconnected` });
            return;
        }
        if (this.phase === "playing") {
            const color = this.colorOf(player.id);
            if (color) {
                this.phase = "over";
                this.winner = opposite(color);
                this.reason = "resign";
                this.status = "checkmate";
                this.broadcast(this.stateMessage(null));
                this.save();
            }
        }
    }

    onDispose(): void {
        this.log.info("chess room disposed", { roomId: this.roomId });
    }

    onTick(): void {
        this.settleDeadline();
    }

    protected getPersistState(): Record<string, unknown> {
        return {
            board: boardToWire(this.board),
            turn: this.turn,
            castling: this.castling,
            ep: this.ep,
            status: this.status,
            phase: this.phase,
            seats: this.seats,
            lastMove: this.lastMove,
            winner: this.winner,
            reason: this.reason,
            halfmove: this.halfmove,
            profiles: this.profiles,
            matchKey: this.matchKey,
            pace: this.pace,
            deadlineAt: this.deadlineAt,
            updatedAt: this.updatedAt,
            moveCount: this.moveCount,
            captureCount: this.captureCount,
            checkCount: this.checkCount,
            reaction: this.reaction,
            rematch: this.rematch,
        };
    }

    onRestore(snapshot: Record<string, unknown>): void {
        const board = snapshot.board as WireBoard | undefined;
        if (Array.isArray(board) && board.length === 64) {
            this.board = board.map((p) => (p ? { color: p.c, type: p.t } : null));
        }
        if (snapshot.turn === "w" || snapshot.turn === "b") this.turn = snapshot.turn;
        if (snapshot.castling && typeof snapshot.castling === "object") {
            this.castling = snapshot.castling as CastlingRights;
        }
        this.ep = typeof snapshot.ep === "number" ? snapshot.ep : null;
        if (typeof snapshot.status === "string") this.status = snapshot.status as GameStatus;
        if (snapshot.phase === "waiting" || snapshot.phase === "playing" || snapshot.phase === "over") {
            this.phase = snapshot.phase;
        }
        if (snapshot.seats && typeof snapshot.seats === "object") {
            this.seats = snapshot.seats as { w: string | null; b: string | null };
        }
        this.winner = snapshot.winner === "w" || snapshot.winner === "b" ? snapshot.winner : null;
        this.reason = typeof snapshot.reason === "string" ? snapshot.reason : null;
        this.halfmove = typeof snapshot.halfmove === "number" ? snapshot.halfmove : 0;
        this.lastMove = (snapshot.lastMove as Move | null) ?? null;
        if (snapshot.profiles && typeof snapshot.profiles === "object") {
            this.profiles = snapshot.profiles as { w: RivalIdentity | null; b: RivalIdentity | null };
        }
        this.matchKey = isMatchKey(snapshot.matchKey) ? snapshot.matchKey : null;
        this.pace = snapshot.pace === "daily" || snapshot.pace === "relaxed" ? snapshot.pace : null;
        this.deadlineAt = typeof snapshot.deadlineAt === "number" ? snapshot.deadlineAt : null;
        this.updatedAt = typeof snapshot.updatedAt === "number" ? snapshot.updatedAt : this.now();
        this.moveCount = typeof snapshot.moveCount === "number" ? Math.max(0, snapshot.moveCount | 0) : 0;
        this.captureCount = typeof snapshot.captureCount === "number" ? Math.max(0, snapshot.captureCount | 0) : 0;
        this.checkCount = typeof snapshot.checkCount === "number" ? Math.max(0, snapshot.checkCount | 0) : 0;
        this.reaction = (snapshot.reaction as { id: ChessReaction; from: string; at: number } | null) ?? null;
        this.rematch = (snapshot.rematch as { matchKey: string; offeredBy: string } | null) ?? null;
        this.settleDeadline();
    }

    private handleResign(playerId: string): void {
        const color = this.colorOf(playerId);
        if (!color || this.phase === "over") return;
        if (this.phase === "waiting" && !this.correspondence) return;
        this.phase = "over";
        this.winner = this.seats.w && this.seats.b ? opposite(color) : null;
        this.reason = this.winner ? "resign" : "cancelled";
        this.status = this.winner ? "checkmate" : "draw";
        this.updatedAt = this.now();
        this.deadlineAt = null;
        this.lock();
        this.broadcast(this.stateMessage(null));
        this.save();
    }

    private handleConfigure(
        playerId: string,
        matchKey: string,
        pace: CorrespondencePace,
        challenger?: RivalIdentity,
        recipient?: RivalIdentity,
    ): void {
        if (!this.correspondence || !isMatchKey(matchKey)) return;
        if (this.matchKey && this.matchKey !== matchKey) {
            this.sendTo(playerId, { type: "error", reason: "This invite points to a different board" });
            return;
        }
        if (pace !== "daily" && pace !== "relaxed") return;

        if (!this.seats.w && !this.seats.b) {
            const safeChallenger = this.safeIdentity(challenger);
            const safeRecipient = this.safeIdentity(recipient);
            if (
                safeChallenger &&
                safeRecipient &&
                safeChallenger.id !== safeRecipient.id &&
                (playerId === safeChallenger.id || playerId === safeRecipient.id)
            ) {
                // The invited player is reserved as White regardless of who opens
                // the room first. That makes "they move first" authoritative.
                this.seats = { w: safeRecipient.id, b: safeChallenger.id };
                this.profiles = { w: safeRecipient, b: safeChallenger };
            } else {
                // A link/code invite does not know the recipient yet. Reserve
                // the creator as Black so the accepting friend gets White and
                // the first move, matching directory challenges.
                this.seats.b = playerId;
            }
        }
        const color = this.colorOf(playerId);
        if (!color) {
            this.sendTo(playerId, { type: "error", reason: "This board belongs to two other players" });
            return;
        }
        const player = this.players.get(playerId);
        if (player) this.profiles[color] = this.identity(player);
        this.matchKey = matchKey;
        if (this.phase === "waiting") this.pace = pace;
        this.updatedAt = this.now();
        this.beginWhenBothPlayersJoined(playerId);
        this.sendTo(playerId, this.stateMessage(playerId));
        this.broadcast(this.stateMessage(null));
        this.save();
    }

    private beginWhenBothPlayersJoined(joiningPlayerId?: string): void {
        if (!this.seats.w || !this.seats.b || this.phase !== "waiting") return;
        const joined = (playerId: string) => playerId === joiningPlayerId || this.players.has(playerId);
        if (!joined(this.seats.w) || !joined(this.seats.b)) return;
        this.phase = "playing";
        this.updatedAt = this.now();
        this.deadlineAt = this.correspondence ? this.updatedAt + this.turnDurationMs() : null;
        if (!this.correspondence) this.lock();
    }

    private identity(player: Player): RivalIdentity {
        return {
            id: player.id,
            username: player.username.trim().slice(0, 40) || "Dreamer",
            avatarUrl: typeof player.avatarUrl === "string" ? player.avatarUrl.slice(0, 500) : null,
        };
    }

    private safeIdentity(value: RivalIdentity | undefined): RivalIdentity | null {
        if (!value || typeof value.id !== "string" || typeof value.username !== "string") return null;
        return {
            id: value.id.slice(0, 128),
            username: value.username.trim().slice(0, 40) || "Dreamer",
            avatarUrl: typeof value.avatarUrl === "string" ? value.avatarUrl.slice(0, 500) : null,
        };
    }

    private handleReaction(playerId: string, reaction: ChessReaction): void {
        if (!this.correspondence || !this.colorOf(playerId)) return;
        if (!CHESS_REACTIONS.some((entry) => entry.id === reaction)) return;
        const now = this.now();
        if (this.reaction?.from === playerId && now - this.reaction.at < REACTION_COOLDOWN_MS) {
            this.sendTo(playerId, { type: "error", reason: "Give the reaction a moment" });
            return;
        }
        this.reaction = { id: reaction, from: playerId, at: now };
        this.updatedAt = now;
        this.broadcast(this.stateMessage(null));
        this.save();

        const recipient = this.otherPlayer(playerId);
        const label = CHESS_REACTIONS.find((entry) => entry.id === reaction)?.label ?? "New reaction";
        if (recipient) {
            void this.notify(playerId, recipient, "lucidmate_send_reaction_notification", {
                opponent: this.profileOf(playerId)?.username ?? "Your rival",
                reaction: label,
            });
        }
    }

    private handleRematch(playerId: string, matchKey: string): void {
        if (!this.correspondence || this.phase !== "over" || !this.colorOf(playerId) || !isMatchKey(matchKey)) return;
        if (this.rematch && this.rematch.offeredBy !== playerId) return;
        this.rematch = { matchKey, offeredBy: playerId };
        this.updatedAt = this.now();
        this.broadcast(this.stateMessage(null));
        this.save();
        const recipient = this.otherPlayer(playerId);
        if (recipient) {
            void this.notify(playerId, recipient, "lucidmate_send_rematch_notification", {
                opponent: this.profileOf(playerId)?.username ?? "Your rival",
            });
        }
    }

    private settleDeadline(): void {
        if (!this.correspondence || this.phase !== "playing" || !this.deadlineAt) return;
        if (this.now() < this.deadlineAt) return;
        this.phase = "over";
        this.winner = opposite(this.turn);
        this.reason = "timeout";
        this.status = "checkmate";
        this.deadlineAt = null;
        this.updatedAt = this.now();
        this.broadcast(this.stateMessage(null));
        this.save();
    }

    private now(): number {
        const serverClock = (this as unknown as { getServerTime?: () => number }).getServerTime;
        return typeof serverClock === "function" ? serverClock.call(this) : Date.now();
    }

    private turnDurationMs(): number {
        return this.pace === "relaxed" ? 3 * DAY_MS : DAY_MS;
    }

    private otherPlayer(playerId: string): string | null {
        if (this.seats.w === playerId) return this.seats.b;
        if (this.seats.b === playerId) return this.seats.w;
        return null;
    }

    private profileOf(playerId: string): RivalIdentity | null {
        if (this.seats.w === playerId) return this.profiles.w;
        if (this.seats.b === playerId) return this.profiles.b;
        return null;
    }

    private async notify(
        actor: string,
        recipient: string,
        recipe: string,
        params: Record<string, string>,
    ): Promise<void> {
        if (!this.matchKey || !this.pace) return;
        try {
            // Room notifications can only target current members. Async rivals
            // normally leave between turns, so the trusted actor executes an
            // any-player notification recipe after the room validates both
            // reserved seat IDs.
            await this.services.simulation.executeRecipe(actor, recipe, {
                targetId: recipient,
                matchKey: this.matchKey,
                pace: this.pace,
                ...params,
            });
        } catch (error) {
            this.log.warn("social notification unavailable", {
                recipient,
                recipe,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private colorOf(playerId: string): Color | null {
        if (this.seats.w === playerId) return "w";
        if (this.seats.b === playerId) return "b";
        return null;
    }

    private computeStatus(): GameStatus {
        const legal = generateLegalMoves(this.board, this.turn, this.castling, this.ep);
        const check = inCheck(this.board, this.turn);
        if (legal.length === 0) return check ? "checkmate" : "stalemate";
        if (this.halfmove >= 100) return "draw";
        return check ? "check" : "playing";
    }

    private stateMessage(you: string | null): ChessServerMessage {
        const seatColors: Record<string, Color> = {};
        if (this.seats.w) seatColors[this.seats.w] = "w";
        if (this.seats.b) seatColors[this.seats.b] = "b";
        return {
            type: "state",
            board: boardToWire(this.board),
            turn: this.turn,
            castling: cloneCastling(this.castling),
            ep: this.ep,
            status: this.status,
            phase: this.phase,
            seats: { ...this.seats },
            seatColors,
            you,
            lastMove: this.lastMove
                ? { from: this.lastMove.from, to: this.lastMove.to, promotion: this.lastMove.promotion }
                : null,
            winner: this.winner,
            reason: this.reason,
            roomCode: this.resolveRoomCode(),
            experience: this.correspondence ? "async" : "live",
            matchKey: this.matchKey,
            pace: this.pace,
            players: { ...this.profiles },
            deadlineAt: this.deadlineAt,
            updatedAt: this.updatedAt,
            moveCount: this.moveCount,
            captureCount: this.captureCount,
            checkCount: this.checkCount,
            reaction: this.reaction ? { ...this.reaction } : null,
            rematch: this.rematch ? { ...this.rematch } : null,
        };
    }

    private resolveRoomCode(): string | null {
        const anyRoom = this as unknown as { roomCode?: string; code?: string };
        return anyRoom.roomCode ?? anyRoom.code ?? null;
    }
}
