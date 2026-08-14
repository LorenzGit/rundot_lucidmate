/**
 * Client-side multiplayer session for LUCIDMATE chess.
 * Clients send move intents only; the GameRoom is authoritative.
 */
import type { ServerRoom } from "@series-inc/rundot-game-sdk";
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";
import {
    CHESS_ROOM_TYPE,
    CORRESPONDENCE_ROOM_TYPE,
    type ChessClientMessage,
    type ChessProtocol,
    type ChessServerMessage,
} from "./protocol.ts";
import type { Color, PieceType } from "./types.ts";
import type { ChessReaction, CorrespondencePace, RivalIdentity } from "../../social/model.ts";
import { describeCorrespondenceError, describeJoinError, isDuplicateSessionError } from "./joinErrors.ts";

export type OnlineConnectMode = "create" | "join";

export type OnlineSessionStatus = "idle" | "connecting" | "waiting" | "playing" | "over" | "error" | "disconnected";

export interface OnlineSessionSnapshot {
    status: OnlineSessionStatus;
    roomCode: string | null;
    you: Color | null;
    phase: "waiting" | "playing" | "over" | null;
    error: string | null;
    lastState: Extract<ChessServerMessage, { type: "state" }> | null;
    playerCount: number;
    experience: "live" | "async";
    matchKey: string | null;
    pace: CorrespondencePace | null;
}

type StateHandler = (state: Extract<ChessServerMessage, { type: "state" }>) => void;
type InfoHandler = (message: string) => void;
type StatusHandler = (snap: OnlineSessionSnapshot) => void;
type ServerState = Extract<ChessServerMessage, { type: "state" }>;

const MAX_PLAYERS = 2;
const ROOM_STATE_TIMEOUT_MS = 12_000;
const DUPLICATE_SESSION_RETRY_MS = [750, 1_500, 3_000, 5_000, 8_000, 12_000] as const;

function realtimeAvailable(): boolean {
    try {
        return typeof (RundotGameAPI as unknown as { realtime?: unknown }).realtime === "object";
    } catch {
        return false;
    }
}

export function canUseAuthoritativeRealtime(): boolean {
    if (!realtimeAvailable()) return false;
    try {
        // isAvailable() only means the SDK object exists; it returns true in
        // Preview App's offline mock too. Multiplayer is authoritative only
        // when the initialized SDK explicitly reports a non-mock host, or when
        // a dev/playground room server URL was positively injected.
        const runtime = window as unknown as {
            __RUNDOT_MULTIPLAYER_DEV_SERVER__?: string;
            __RUNDOT_GAME_PLAYGROUND__?: { enabled?: boolean; roomServerUrl?: string; versionTag?: string };
        };
        const playground = runtime.__RUNDOT_GAME_PLAYGROUND__;
        if (runtime.__RUNDOT_MULTIPLAYER_DEV_SERVER__) return true;
        if (playground?.enabled) return Boolean(playground.roomServerUrl && playground.versionTag);
        if (RundotGameAPI.isMock()) return false;

        // SDK 5.24 does not expose room-server readiness as a public
        // capability. Its initialized RemoteHost does retain the positive
        // INIT_SDK roomServerUrl; fail closed when Preview App omits it.
        const api = RundotGameAPI as unknown as { host?: { _roomServerUrl?: unknown } };
        return typeof api.host?._roomServerUrl === "string" && /^https?:\/\//.test(api.host._roomServerUrl);
    } catch {
        return false;
    }
}

export class OnlineChessClient {
    private room: ServerRoom<ChessProtocol> | null = null;
    private status: OnlineSessionStatus = "idle";
    private roomCode: string | null = null;
    private you: Color | null = null;
    private phase: "waiting" | "playing" | "over" | null = null;
    private error: string | null = null;
    private lastState: Extract<ChessServerMessage, { type: "state" }> | null = null;
    private playerCount = 0;
    private experience: "live" | "async" = "live";
    private matchKey: string | null = null;
    private pace: CorrespondencePace | null = null;
    private onState: StateHandler | null = null;
    private onInfo: InfoHandler | null = null;
    private onStatus: StatusHandler | null = null;
    private stateListeners = new Set<(state: ServerState) => void>();
    private stateErrorListeners = new Set<(error: Error) => void>();
    private connectGeneration = 0;
    private correspondenceConnect: { matchKey: string; promise: Promise<boolean> } | null = null;

    setHandlers(opts: { onState?: StateHandler; onInfo?: InfoHandler; onStatus?: StatusHandler }): void {
        this.onState = opts.onState ?? null;
        this.onInfo = opts.onInfo ?? null;
        this.onStatus = opts.onStatus ?? null;
    }

    snapshot(): OnlineSessionSnapshot {
        return {
            status: this.status,
            roomCode: this.roomCode,
            you: this.you,
            phase: this.phase,
            error: this.error,
            lastState: this.lastState,
            playerCount: this.playerCount,
            experience: this.experience,
            matchKey: this.matchKey,
            pace: this.pace,
        };
    }

    private emitStatus(): void {
        this.onStatus?.(this.snapshot());
    }

    private setStatus(status: OnlineSessionStatus, error: string | null = null): void {
        this.status = status;
        if (error !== null) this.error = error;
        this.emitStatus();
    }

    private waitForState(predicate: (state: ServerState) => boolean, timeoutMs = 6_000): Promise<ServerState> {
        if (this.lastState && predicate(this.lastState)) return Promise.resolve(this.lastState);
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timeout);
                this.stateListeners.delete(listener);
                this.stateErrorListeners.delete(errorListener);
            };
            const listener = (state: ServerState) => {
                if (!predicate(state)) return;
                cleanup();
                resolve(state);
            };
            const errorListener = (error: Error) => {
                cleanup();
                reject(error);
            };
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error("The match did not send its board state."));
            }, timeoutMs);
            this.stateListeners.add(listener);
            this.stateErrorListeners.add(errorListener);
        });
    }

    async connect(mode: OnlineConnectMode, joinCode?: string): Promise<boolean> {
        await this.leave();
        const generation = ++this.connectGeneration;
        this.error = null;
        this.you = null;
        this.phase = null;
        this.lastState = null;
        this.roomCode = null;
        this.playerCount = 0;
        this.experience = "live";
        this.matchKey = null;
        this.pace = null;
        this.setStatus("connecting");

        if (!canUseAuthoritativeRealtime()) {
            this.setStatus(
                "error",
                "Online play is not connected in this preview. Open the game in RUN or use the multiplayer preview.",
            );
            return false;
        }

        try {
            let room: ServerRoom<ChessProtocol>;
            if (mode === "join") {
                const code = (joinCode ?? "").trim().toUpperCase();
                if (!/^[A-Z0-9]{6}$/.test(code)) {
                    this.setStatus("error", "Enter the 6-character match code.");
                    return false;
                }
                room = await RundotGameAPI.realtime.joinRoomByCode<ChessProtocol>(code);
            } else {
                room = await RundotGameAPI.realtime.createRoom<ChessProtocol>(CHESS_ROOM_TYPE, {
                    createOptions: {
                        maxPlayers: MAX_PLAYERS,
                        isPrivate: true,
                        metadata: { game: "lucidmate", mode: "chess" },
                    },
                });
            }

            if (generation !== this.connectGeneration) {
                room.leave();
                return false;
            }

            this.room = room;
            this.roomCode = room.roomCode;
            this.playerCount = room.players.length;
            this.bindRoom(room);
            room.send({ type: "ready" } satisfies ChessClientMessage);
            await this.waitForState(() => true);
            this.setStatus(this.phase === "over" ? "over" : this.phase === "playing" ? "playing" : "waiting");
            return true;
        } catch (err) {
            const room = this.room;
            this.room = null;
            room?.leave();
            const message = mode === "join" ? describeJoinError(err) : "Could not start an online match. Try again.";
            this.setStatus("error", message);
            return false;
        }
    }

    async connectCorrespondence(
        matchKey: string,
        pace: CorrespondencePace,
        knownRoomCode?: string | null,
        reservation?: { challenger: RivalIdentity; recipient: RivalIdentity } | null,
    ): Promise<boolean> {
        if (this.correspondenceConnect?.matchKey === matchKey) return this.correspondenceConnect.promise;
        const promise = this.connectCorrespondenceNow(matchKey, pace, knownRoomCode, reservation);
        this.correspondenceConnect = { matchKey, promise };
        try {
            return await promise;
        } finally {
            if (this.correspondenceConnect?.promise === promise) this.correspondenceConnect = null;
        }
    }

    private async connectCorrespondenceNow(
        matchKey: string,
        pace: CorrespondencePace,
        knownRoomCode?: string | null,
        reservation?: { challenger: RivalIdentity; recipient: RivalIdentity } | null,
    ): Promise<boolean> {
        if (
            this.room &&
            this.experience === "async" &&
            this.matchKey === matchKey &&
            this.room.connectionState !== "disconnected"
        ) {
            return this.recoverCorrespondenceRoom(this.room, matchKey, pace, reservation);
        }
        if (this.room?.connectionState === "disconnected") this.releaseRoom();
        else await this.leave();
        const generation = ++this.connectGeneration;
        this.error = null;
        this.you = null;
        this.phase = null;
        this.lastState = null;
        this.roomCode = null;
        this.playerCount = 0;
        this.experience = "async";
        this.matchKey = matchKey;
        this.pace = pace;
        this.setStatus("connecting");

        if (!canUseAuthoritativeRealtime()) {
            this.setStatus(
                "error",
                "This preview is offline, so it cannot restore the board. Open the game in RUN or use the multiplayer preview.",
            );
            return false;
        }

        let lastError: unknown = null;
        if (knownRoomCode) {
            const exact = await this.openCorrespondenceWithRetry(
                () => RundotGameAPI.realtime.joinRoomByCode<ChessProtocol>(knownRoomCode),
                matchKey,
                pace,
                reservation,
                generation,
            );
            if (exact.ok) {
                return true;
            }
            if (exact.aborted) return false;
            lastError = exact.error;
            // A duplicate means the iOS-suspended socket is still inside the
            // server grace window. The bounded retries above are the recovery;
            // opening through the persistent key would hit the same seat again.
            if (isDuplicateSessionError(lastError)) {
                this.setStatus("error", describeCorrespondenceError(lastError));
                return false;
            }
        }

        const persistent = await this.openCorrespondenceWithRetry(
            () =>
                RundotGameAPI.realtime.joinOrCreateRoom<ChessProtocol>(CORRESPONDENCE_ROOM_TYPE, {
                    // The persistent key is authoritative in production. The
                    // equality criterion also prevents older/local room routers
                    // from reusing an unrelated open correspondence room.
                    criteria: { matchKey },
                    persistentKey: matchKey,
                }),
            matchKey,
            pace,
            reservation,
            generation,
        );
        if (persistent.ok) {
            return true;
        }
        if (persistent.aborted) return false;
        lastError = persistent.error;
        this.setStatus("error", describeCorrespondenceError(lastError));
        return false;
    }

    private async openCorrespondenceWithRetry(
        openRoom: () => Promise<ServerRoom<ChessProtocol>>,
        matchKey: string,
        pace: CorrespondencePace,
        reservation: { challenger: RivalIdentity; recipient: RivalIdentity } | null | undefined,
        generation: number,
    ): Promise<{ ok: true } | { ok: false; aborted?: true; error?: unknown }> {
        let lastError: unknown = null;
        for (let attempt = 0; attempt <= DUPLICATE_SESSION_RETRY_MS.length; attempt += 1) {
            if (generation !== this.connectGeneration) return { ok: false, aborted: true };
            if (attempt > 0) {
                await new Promise((resolve) => setTimeout(resolve, DUPLICATE_SESSION_RETRY_MS[attempt - 1]));
                if (generation !== this.connectGeneration) return { ok: false, aborted: true };
            }
            try {
                const room = await openRoom();
                if (generation !== this.connectGeneration) {
                    room.leave();
                    return { ok: false, aborted: true };
                }
                await this.openCorrespondenceRoom(room, matchKey, pace, reservation);
                this.finishConnection();
                return { ok: true };
            } catch (error) {
                lastError = error;
                this.releaseRoom();
                if (!isDuplicateSessionError(error)) break;
                this.error = null;
                this.setStatus("connecting");
            }
        }
        return { ok: false, error: lastError };
    }

    private async recoverCorrespondenceRoom(
        room: ServerRoom<ChessProtocol>,
        matchKey: string,
        pace: CorrespondencePace,
        reservation?: { challenger: RivalIdentity; recipient: RivalIdentity } | null,
    ): Promise<boolean> {
        this.error = null;
        this.lastState = null;
        this.setStatus("connecting");
        const state = this.waitForState(
            (next) => next.experience === "async" && next.matchKey === matchKey,
            ROOM_STATE_TIMEOUT_MS,
        );
        if (room.connectionState === "connected") {
            try {
                room.send({ type: "configure", matchKey, pace, ...reservation } satisfies ChessClientMessage);
                room.send({ type: "ready" } satisfies ChessClientMessage);
            } catch {
                // The SDK may already be entering automatic reconnection. Its
                // onReconnected callback sends ready again.
            }
        }
        try {
            await state;
            this.finishConnection();
            return true;
        } catch (error) {
            this.setStatus("error", describeCorrespondenceError(error));
            return false;
        }
    }

    private async openCorrespondenceRoom(
        room: ServerRoom<ChessProtocol>,
        matchKey: string,
        pace: CorrespondencePace,
        reservation?: { challenger: RivalIdentity; recipient: RivalIdentity } | null,
        timeoutMs = ROOM_STATE_TIMEOUT_MS,
    ): Promise<void> {
        this.room = room;
        this.roomCode = room.roomCode;
        this.playerCount = room.players.length;
        this.bindRoom(room);
        room.send({ type: "configure", matchKey, pace, ...reservation } satisfies ChessClientMessage);
        room.send({ type: "ready" } satisfies ChessClientMessage);
        await this.waitForState((state) => state.experience === "async" && state.matchKey === matchKey, timeoutMs);
    }

    private finishConnection(): void {
        this.error = null;
        this.setStatus(this.phase === "over" ? "over" : this.phase === "playing" ? "playing" : "waiting");
    }

    private releaseRoom(): void {
        const room = this.room;
        this.room = null;
        try {
            room?.leave();
        } catch {
            /* ignore */
        }
        this.roomCode = null;
        this.you = null;
        this.phase = null;
        this.lastState = null;
        this.playerCount = 0;
        this.stateListeners.clear();
        this.stateErrorListeners.clear();
    }

    private bindRoom(room: ServerRoom<ChessProtocol>): void {
        room.on({
            onMessage: (message) => {
                if (this.room === room) this.handleMessage(message);
            },
            onPrivateMessage: (message) => {
                if (this.room === room) this.handleMessage(message);
            },
            onPlayerJoined: () => {
                if (this.room !== room) return;
                this.playerCount = room.players.length;
                this.emitStatus();
            },
            onPlayerLeft: () => {
                if (this.room !== room) return;
                this.playerCount = room.players.length;
                this.emitStatus();
            },
            onError: (error) => {
                if (this.room !== room) return;
                if (this.experience === "async" && isDuplicateSessionError(error)) {
                    this.error = null;
                    this.setStatus("connecting");
                    return;
                }
                const safeError =
                    this.experience === "async"
                        ? describeCorrespondenceError(error)
                        : describeJoinError(error || "Room error");
                this.setStatus("error", safeError);
            },
            onDisconnect: () => {
                if (this.room !== room) return;
                if (this.experience === "async" && this.matchKey && this.pace) {
                    const matchKey = this.matchKey;
                    const pace = this.pace;
                    const roomCode = this.roomCode;
                    this.error = null;
                    this.setStatus("connecting");
                    void this.connectCorrespondence(matchKey, pace, roomCode);
                    return;
                }
                this.setStatus("disconnected", "Disconnected from match.");
            },
            onReconnecting: () => {
                if (this.room !== room) return;
                this.error = null;
                this.setStatus("connecting");
            },
            onReconnected: () => {
                if (this.room !== room) return;
                this.error = null;
                this.setStatus(this.phase === "playing" ? "playing" : "waiting");
                try {
                    room.send({ type: "ready" });
                } catch {
                    /* ignore */
                }
            },
            onResync: () => {
                if (this.room !== room) return;
                try {
                    room.send({ type: "ready" });
                } catch {
                    /* ignore */
                }
            },
        });
    }

    private handleMessage(message: ChessProtocol): void {
        if (!message || typeof message !== "object" || !("type" in message)) return;

        if (message.type === "error") {
            this.onInfo?.(message.reason);
            this.error = message.reason;
            this.emitStatus();
            for (const reject of [...this.stateErrorListeners]) reject(new Error(message.reason));
            return;
        }
        if (message.type === "info") {
            this.onInfo?.(message.message);
            return;
        }
        if (message.type !== "state") return;

        if (
            this.experience === "async" &&
            (message.experience !== "async" ||
                (message.matchKey && this.matchKey && message.matchKey !== this.matchKey))
        ) {
            this.setStatus("error", "This invite points to a different board.");
            this.room?.leave();
            this.room = null;
            return;
        }

        this.lastState = message;
        this.roomCode = message.roomCode ?? this.roomCode;
        this.phase = message.phase;
        this.experience = message.experience;
        this.matchKey = message.matchKey ?? this.matchKey;
        this.pace = message.pace ?? this.pace;

        const playerId = this.room?.playerId;
        if (playerId) {
            const seat = message.seatColors[playerId];
            if (seat === "w" || seat === "b") this.you = seat;
            else if (message.seats.w === playerId) this.you = "w";
            else if (message.seats.b === playerId) this.you = "b";
        }

        if (message.phase === "over") this.status = "over";
        else if (message.phase === "playing") this.status = "playing";
        else if (message.phase === "waiting") this.status = "waiting";

        this.emitStatus();
        this.onState?.(message);
        for (const listener of this.stateListeners) listener(message);
    }

    sendMove(from: number, to: number, promotion?: PieceType | null): boolean {
        if (!this.room || this.status === "error" || this.status === "disconnected") return false;
        try {
            this.room.send({
                type: "move",
                from,
                to,
                promotion: promotion ?? null,
            });
            return true;
        } catch {
            return false;
        }
    }

    resign(): void {
        if (!this.room) return;
        try {
            this.room.send({ type: "resign" });
        } catch {
            /* ignore */
        }
    }

    async endMatch(): Promise<ServerState | null> {
        if (!this.room || this.experience !== "async") return null;
        if (this.lastState?.phase === "over") return this.lastState;
        try {
            const ended = this.waitForState((state) => state.phase === "over");
            this.room.send({ type: "resign" });
            return await ended;
        } catch {
            return null;
        }
    }

    react(reaction: ChessReaction): boolean {
        if (!this.room || this.experience !== "async") return false;
        try {
            this.room.send({ type: "react", reaction });
            return true;
        } catch {
            return false;
        }
    }

    requestRematch(matchKey: string): boolean {
        if (!this.room || this.experience !== "async") return false;
        try {
            this.room.send({ type: "rematch", matchKey });
            return true;
        } catch {
            return false;
        }
    }

    async leave(): Promise<void> {
        this.connectGeneration += 1;
        const room = this.room;
        this.room = null;
        if (room) {
            try {
                room.leave();
            } catch {
                /* ignore */
            }
        }
        this.status = "idle";
        this.roomCode = null;
        this.you = null;
        this.phase = null;
        this.error = null;
        this.lastState = null;
        this.playerCount = 0;
        this.experience = "live";
        this.matchKey = null;
        this.pace = null;
        for (const reject of [...this.stateErrorListeners]) reject(new Error("Connection closed."));
        this.stateListeners.clear();
        this.stateErrorListeners.clear();
        this.emitStatus();
    }
}

export const onlineChess = new OnlineChessClient();
