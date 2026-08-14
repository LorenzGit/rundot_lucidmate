/**
 * Bridge between the chess match, the Pixi scene, the store, and monetization hooks.
 */
import { audioManager } from "../audio/audioManager.ts";
import { store } from "../state/store.ts";
import { analytics } from "../systems/analytics/analyticsConfig.ts";
import { dailySystems } from "../systems/dailySystems.ts";
import { dreamMastery, masteryRewardsBetween } from "../systems/mastery.ts";
import { saveSystem } from "../systems/save.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import type { AiDifficulty } from "./chess/ai.ts";
import { ChessMatch, type MatchConfig, type OpponentMode } from "./chess/game.ts";
import { onlineChess, type OnlineConnectMode, type OnlineSessionSnapshot } from "./chess/onlineClient.ts";
import { wireToBoard, type ChessServerMessage } from "./chess/protocol.ts";
import type { Color, GameStatus, Move, PieceType } from "./chess/types.ts";
import type { ChessScene } from "./scene/chessScene.ts";
import { correspondence } from "../social/correspondence.ts";
import type { CorrespondenceMatch, CorrespondencePace } from "../social/model.ts";
import { rivalsClient } from "../social/rivalsClient.ts";
import { getRunPlayerProfile, shareRunLink } from "../sdk/runSdk.ts";

export const UNDO_COST = 12;
export const HINT_COST = 8;

function correspondenceReservation(match: CorrespondenceMatch | null | undefined) {
    const profile = getRunPlayerProfile();
    if (!match?.opponent || !profile) return null;
    const current = { id: profile.id, username: profile.username, avatarUrl: profile.avatarUrl };
    return match.challenger
        ? { challenger: current, recipient: match.opponent }
        : { challenger: match.opponent, recipient: current };
}

export class RunController {
    match: ChessMatch;
    private scene: ChessScene | null = null;
    private aiTimer: ReturnType<typeof setTimeout> | null = null;
    private finished = false;
    private onlineWired = false;
    private onlineStateHydrated = false;
    /** Last server lastMove key we already animated/applied. */
    private lastAppliedKey: string | null = null;
    private pendingAsyncMoveKey: string | null = null;
    private lastReactionKey: string | null = null;

    constructor(config?: Partial<MatchConfig>) {
        const state = store.get();
        this.match = new ChessMatch({
            playerColor: config?.playerColor ?? state.playerColor,
            opponent: config?.opponent ?? state.opponentMode,
            difficulty: config?.difficulty ?? state.difficulty,
        });
        if (this.match.config.opponent === "online") {
            this.match.setInteractionLocked(true);
        }
        this.mirrorStore();
    }

    get sceneCallbacks() {
        return {
            onPlayerMoved: (move: Move) => this.afterPlayerMove(move),
            onNeedPromotion: () => {
                store.patch({ pendingPromotion: true });
            },
            onIllegal: () => {
                audioManager.play("reject");
                void runtimeServices.haptic("light");
            },
            onMatchOver: () => this.finishMatch(),
            onSelect: () => {
                audioManager.play("pick");
                void runtimeServices.haptic("light");
            },
        };
    }

    attach(scene: ChessScene): void {
        this.scene = scene;
        this.mirrorStore();
        if (this.match.config.opponent === "online") {
            this.wireOnline();
        } else {
            this.maybeScheduleAi();
        }
    }

    detach(): void {
        if (this.aiTimer) {
            clearTimeout(this.aiTimer);
            this.aiTimer = null;
        }
        if (this.onlineWired) {
            onlineChess.setHandlers({});
            this.onlineWired = false;
        }
        this.scene = null;
    }

    private wireOnline(): void {
        if (this.onlineWired) return;
        this.onlineWired = true;
        onlineChess.setHandlers({
            onState: (state) => this.onOnlineState(state),
            onInfo: (message) => {
                store.patch({ toast: message });
            },
            onStatus: (snap) => this.mirrorOnlineStatus(snap),
        });
        // Apply any state already received while connecting.
        const existing = onlineChess.snapshot().lastState;
        if (existing) this.onOnlineState(existing);
        this.mirrorOnlineStatus(onlineChess.snapshot());
    }

    private mirrorOnlineStatus(snap: OnlineSessionSnapshot): void {
        store.patch({
            onlineStatus: snap.status,
            onlineRoomCode: snap.roomCode,
            onlineError: snap.error,
            onlineSeat: snap.you,
            onlinePlayerCount: snap.playerCount,
            onlineExperience: snap.experience,
            activeMatchKey: snap.experience === "async" ? snap.matchKey : null,
            activeMatchPace: snap.experience === "async" ? snap.pace : null,
            thinking: snap.status === "waiting" || snap.status === "connecting",
        });
        if (snap.you) {
            this.match.setPlayerColor(snap.you);
            store.patch({ playerColor: snap.you });
        }
        const lock =
            snap.status === "waiting" ||
            snap.status === "connecting" ||
            snap.status === "error" ||
            snap.status === "disconnected";
        this.match.setInteractionLocked(lock);
        if (snap.status === "disconnected" || snap.status === "error") {
            if (snap.error) store.patch({ toast: snap.error });
        }
    }

    private moveKey(move: { from: number; to: number; promotion?: PieceType | null } | null): string | null {
        if (!move) return null;
        return `${move.from}-${move.to}-${move.promotion ?? ""}`;
    }

    private onOnlineState(state: Extract<ChessServerMessage, { type: "state" }>): void {
        const seat = onlineChess.snapshot().you ?? (state.you ? state.seatColors[state.you] : null) ?? null;

        const board = wireToBoard(state.board);
        const nextKey = this.moveKey(state.lastMove);
        const isNewMove = nextKey !== null && nextKey !== this.lastAppliedKey;
        const wasHydrated = this.onlineStateHydrated;

        const lastMove: Move | null = state.lastMove
            ? {
                  from: state.lastMove.from,
                  to: state.lastMove.to,
                  promotion: state.lastMove.promotion,
                  piece: board[state.lastMove.to]?.type ?? "p",
                  color: board[state.lastMove.to]?.color ?? "w",
                  capture: null,
                  flags: "",
              }
            : null;

        // summary() treats checkmate as "side to move lost" — align turn with winner on terminal.
        let applyTurn = state.turn;
        let applyStatus: GameStatus =
            state.status === "checkmate" ||
            state.status === "stalemate" ||
            state.status === "draw" ||
            state.status === "check"
                ? state.status
                : "playing";
        if (state.phase === "over" && state.winner && state.reason === "resign") {
            applyStatus = "checkmate";
            applyTurn = state.winner === "w" ? "b" : "w";
        } else if (state.phase === "over" && state.winner && applyStatus === "checkmate") {
            applyTurn = state.winner === "w" ? "b" : "w";
        }

        const auth =
            seat != null
                ? {
                      board,
                      turn: applyTurn,
                      castling: state.castling,
                      epTarget: state.ep,
                      status: applyStatus,
                      lastMove,
                      playerColor: seat,
                      moveCount: state.moveCount,
                      captureCount: state.captureCount,
                      checkCount: state.checkCount,
                  }
                : {
                      board,
                      turn: applyTurn,
                      castling: state.castling,
                      epTarget: state.ep,
                      status: applyStatus,
                      lastMove,
                      moveCount: state.moveCount,
                      captureCount: state.captureCount,
                      checkCount: state.checkCount,
                  };
        const { previousLast, nextLast } = this.match.applyAuthoritative(auth);
        void previousLast;

        if (seat) {
            this.match.setPlayerColor(seat);
            store.patch({ playerColor: seat, onlineSeat: seat });
        }

        this.match.setInteractionLocked(state.phase !== "playing");

        if (this.scene) {
            if (!wasHydrated) {
                // Initial room hydration already contains the final board. Replaying
                // its last move against a fresh scene creates duplicate pieces.
                this.scene.syncFromMatch();
            } else if (isNewMove && nextLast) {
                // Animate only moves received after an authoritative board exists.
                this.scene.applyExternalMove(nextLast);
                this.playMoveFeedback(nextLast);
            } else {
                this.scene.refreshOnly();
            }
        }

        this.lastAppliedKey = nextKey;
        this.onlineStateHydrated = true;
        const socialMatch = correspondence.sync(state, onlineChess.snapshot());
        if (state.reaction && socialMatch && !socialMatch.reactionsMuted) {
            const reactionKey = `${state.reaction.from}-${state.reaction.id}-${state.reaction.at}`;
            if (reactionKey !== this.lastReactionKey && state.reaction.from !== (seat ? state.seats[seat] : null)) {
                const labels = {
                    nice_move: "Nice move",
                    didnt_see_it: "Surprised",
                    good_game: "Good game",
                    rematch: "Rematch?",
                } as const;
                store.patch({
                    toast: `${socialMatch.opponent?.username ?? "Your rival"}: ${labels[state.reaction.id]}`,
                });
                this.lastReactionKey = reactionKey;
            }
        }
        this.mirrorStore();

        if (
            state.experience === "async" &&
            this.pendingAsyncMoveKey &&
            nextKey === this.pendingAsyncMoveKey &&
            seat &&
            state.turn !== seat
        ) {
            this.pendingAsyncMoveKey = null;
            const opponent = socialMatch?.opponent?.username ?? "your friend";
            store.patch({ toast: `Move sent — waiting for ${opponent}.` });
        }

        if (state.phase === "over" || this.match.isOver()) {
            // Align local terminal status with server winner if needed
            if (state.reason === "resign" || state.reason === "checkmate") {
                // summary() derives from turn/status; ensure checkmate if resign
                if (state.winner && state.status !== "stalemate" && state.status !== "draw") {
                    // force mated side to be the loser side-to-move
                }
            }
            this.finishMatch();
        }
    }

    private playMoveFeedback(move: Move): void {
        if (move.flags.includes("K") || move.flags.includes("Q")) {
            audioManager.play("castle");
            void runtimeServices.haptic("medium");
        } else if (move.promotion) {
            audioManager.play("promote");
            void runtimeServices.haptic("medium");
        } else if (move.capture) {
            audioManager.play("capture");
            void runtimeServices.haptic("medium");
        } else {
            audioManager.play("place");
            void runtimeServices.haptic("light");
        }
        const status = this.match.snapshot().status;
        if (status === "check" || status === "checkmate") {
            audioManager.play("check");
            void runtimeServices.haptic("heavy");
        }
    }

    private mirrorStore(): void {
        const snap = this.match.snapshot();
        store.patch({
            matchStatus: snap.status,
            turn: snap.turn,
            thinking:
                snap.thinking ||
                (snap.config.opponent === "online" &&
                    (store.get().onlineStatus === "waiting" || store.get().onlineStatus === "connecting")),
            movesPlayed: snap.history.length,
            captures: snap.captures,
            canUndo: this.match.canUndo(),
            pendingPromotion: snap.pendingPromotion !== null,
            matchSummary: null,
        });
    }

    private afterPlayerMove(move: Move): void {
        this.playMoveFeedback(move);
        this.lastAppliedKey = this.moveKey(move);

        if (this.match.config.opponent === "online") {
            const sent = onlineChess.sendMove(move.from, move.to, move.promotion);
            if (!sent) {
                store.patch({ toast: "Could not send move — check connection." });
                audioManager.play("reject");
            } else if (store.get().onlineExperience === "async") {
                this.pendingAsyncMoveKey = this.moveKey(move);
            }
            this.mirrorStore();
            if (this.match.isOver()) this.finishMatch();
            return;
        }

        this.mirrorStore();
        if (this.match.isOver()) {
            this.finishMatch();
            return;
        }
        this.maybeScheduleAi();
    }

    private maybeScheduleAi(): void {
        if (this.match.config.opponent !== "ai") return;
        if (this.match.isOver()) return;
        const snap = this.match.snapshot();
        if (snap.turn === this.match.config.playerColor) return;

        store.patch({ thinking: true });
        this.scene?.refreshOnly();
        if (this.aiTimer) clearTimeout(this.aiTimer);
        this.aiTimer = setTimeout(() => {
            this.aiTimer = null;
            this.runAi();
        }, 420);
    }

    private runAi(): void {
        if (!this.scene) return;
        const move = this.match.playAi();
        store.patch({ thinking: false });
        if (!move) {
            this.mirrorStore();
            if (this.match.isOver()) this.finishMatch();
            return;
        }
        this.scene.applyExternalMove(move);
        this.playMoveFeedback(move);
        this.mirrorStore();
        if (this.match.isOver()) this.finishMatch();
    }

    promote(type: PieceType): void {
        this.scene?.choosePromotion(type);
        audioManager.play("promote");
        void runtimeServices.haptic("success");
        store.patch({ pendingPromotion: false });
        this.mirrorStore();
        if (this.match.isOver()) this.finishMatch();
        else this.maybeScheduleAi();
    }

    undo(): boolean {
        if (this.match.config.opponent === "online") {
            store.patch({ toast: "Undo is offline-only." });
            audioManager.play("reject");
            return false;
        }
        const state = store.get();
        if (state.auras < UNDO_COST && !state.freeUndoReady) {
            store.patch({ toast: "Not enough auras for an undo." });
            audioManager.play("reject");
            return false;
        }
        if (!this.match.canUndo()) {
            audioManager.play("reject");
            return false;
        }
        const ok = this.match.undo();
        if (!ok) return false;
        if (state.freeUndoReady) {
            store.patch({ freeUndoReady: false });
        } else {
            store.patch({ auras: Math.max(0, state.auras - UNDO_COST) });
        }
        this.scene?.syncFromMatch();
        this.mirrorStore();
        audioManager.play("undo");
        void runtimeServices.haptic("medium");
        void saveSystem.flush();
        return true;
    }

    hint(): boolean {
        const state = store.get();
        if (state.auras < HINT_COST && !state.freeHintReady) {
            store.patch({ toast: "Not enough auras for a hint." });
            audioManager.play("reject");
            void runtimeServices.haptic("error");
            return false;
        }
        const move = this.match.hintMove();
        if (!move) {
            audioManager.play("reject");
            void runtimeServices.haptic("error");
            return false;
        }
        if (state.freeHintReady) {
            store.patch({ freeHintReady: false });
        } else {
            store.patch({ auras: Math.max(0, state.auras - HINT_COST) });
        }
        this.scene?.showHint(move.from, move.to);
        audioManager.play("hint");
        void runtimeServices.haptic("success");
        void saveSystem.flush();
        return true;
    }

    private finishMatch(): void {
        if (this.finished) return;
        this.finished = true;
        const summary = this.match.summary();
        if (!summary) return;

        const state = store.get();
        const isCorrespondence = state.onlineExperience === "async" && state.activeMatchKey;
        if (isCorrespondence && !correspondence.markCredited(isCorrespondence)) {
            store.patch({ matchSummary: summary, matchStatus: summary.status, onlineStatus: "over" });
            return;
        }
        const wins = state.wins + (summary.playerWon ? 1 : 0);
        const losses = state.losses + (summary.result === "loss" ? 1 : 0);
        const draws = state.draws + (summary.result === "draw" ? 1 : 0);
        const matchesPlayed = state.matchesPlayed + 1;
        const bestWinStreak = summary.playerWon
            ? Math.max(state.bestWinStreak, state.currentWinStreak + 1)
            : state.bestWinStreak;
        const currentWinStreak = summary.playerWon ? state.currentWinStreak + 1 : 0;
        const capturesLifetime = state.capturesLifetime + summary.captures;
        const previousMastery = dreamMastery(state);
        const nextMastery = dreamMastery({
            matchesPlayed,
            wins,
            capturesLifetime,
            bestWinStreak,
        });
        const masteryBonusAuras = masteryRewardsBetween(previousMastery.rankIndex, nextMastery.rankIndex);
        const auras = state.auras + summary.aurasEarned + masteryBonusAuras;

        store.patch({
            matchSummary: summary,
            matchStatus: summary.status,
            auras,
            wins,
            losses,
            draws,
            matchesPlayed,
            bestWinStreak,
            currentWinStreak,
            capturesLifetime,
            masteryBonusAuras,
            onlineStatus: state.opponentMode === "online" ? "over" : state.onlineStatus,
        });
        // Shipped step 3 — first match reaching a result, whatever the result.
        // Once-ever dedupes; finishing is causally downstream of step 2.
        analytics.funnelStep("lucidmate_first_run", 3, { result: summary.result });
        // Repeatable depth plot: `run_completed_N` = Nth lifetime finished
        // match; counts past 12 no-op via the out-of-range rule.
        analytics.funnelStep("engagement", matchesPlayed, { result: summary.result });
        if (masteryBonusAuras > 0) {
            runtimeServices.track("dream_rank_reached", {
                rank: nextMastery.rankName,
                rank_index: nextMastery.rankIndex,
                bonus_auras: masteryBonusAuras,
            });
        }
        dailySystems.recordQuestProgress("matches", 1);
        if (summary.playerWon) dailySystems.recordQuestProgress("wins", 1);
        if (summary.captures > 0) dailySystems.recordQuestProgress("captures", summary.captures);
        audioManager.play(summary.playerWon ? "reward" : summary.result === "draw" ? "draw" : "gameover");
        void runtimeServices.haptic(summary.playerWon ? "success" : "warning");
        void saveSystem.flush();
    }
}

export function startMatch(opts: { opponent: OpponentMode; difficulty: AiDifficulty; playerColor: Color }): void {
    // Shipped step 2 — the first real intent beat. Every entry into a match
    // (local AND online) funnels through here; once-ever dedupes replays.
    analytics.funnelStep("lucidmate_first_run", 2, { opponent: opts.opponent });
    store.patch({
        phase: "playing",
        opponentMode: opts.opponent,
        difficulty: opts.difficulty,
        playerColor: opts.playerColor,
        matchSummary: null,
        pendingPromotion: false,
        thinking: false,
        freeHintReady: false,
        freeUndoReady: false,
        auraDoubled: false,
        masteryBonusAuras: 0,
        ...(opts.opponent === "online"
            ? {}
            : { activeMatchKey: null, activeMatchPace: null, onlineExperience: "live" as const }),
    });
    void saveSystem.flush();
}

/** Connect to a realtime chess room, then enter the playing phase. */
export async function startOnlineMatch(opts: { mode: OnlineConnectMode; joinCode?: string }): Promise<boolean> {
    await rivalsClient.disconnect();
    store.patch({
        opponentMode: "online",
        onlineMode: opts.mode,
        onlineStatus: "connecting",
        onlineError: null,
        onlineRoomCode: null,
        onlineSeat: null,
        onlinePlayerCount: 0,
        onlineExperience: "live",
        activeMatchKey: null,
        activeMatchPace: null,
        matchSummary: null,
        pendingPromotion: false,
        thinking: true,
        toast: opts.mode === "join" ? "Joining room…" : "Creating room…",
    });

    const ok = await onlineChess.connect(opts.mode, opts.joinCode);
    const snap = onlineChess.snapshot();
    store.patch({
        onlineStatus: snap.status,
        onlineRoomCode: snap.roomCode,
        onlineError: snap.error,
        onlineSeat: snap.you,
        onlinePlayerCount: snap.playerCount,
        onlineExperience: snap.experience,
        activeMatchKey: snap.experience === "async" ? snap.matchKey : null,
        activeMatchPace: snap.experience === "async" ? snap.pace : null,
        toast: ok ? null : (snap.error ?? "Online match failed"),
    });

    if (!ok) {
        store.patch({ thinking: false, opponentMode: "online" });
        return false;
    }

    startMatch({
        opponent: "online",
        difficulty: store.get().difficulty,
        // Seat may still be unknown until first state; default white until assigned.
        playerColor: snap.you ?? "w",
    });
    store.patch({
        onlineStatus: snap.status,
        onlineRoomCode: snap.roomCode,
        onlineExperience: snap.experience,
        activeMatchKey: snap.experience === "async" ? snap.matchKey : null,
        activeMatchPace: snap.experience === "async" ? snap.pace : null,
        thinking: snap.status === "waiting" || snap.status === "connecting",
    });
    return true;
}

/** Publish a durable async challenge. The invited rival is White and moves first. */
export async function challengeRival(target: { id: string; username: string }): Promise<boolean> {
    if (store.get().socialBusy) return false;
    const pace: CorrespondencePace = "daily";
    const matchKey = correspondence.createMatchKey();
    store.patch({ socialBusy: true, rivalDirectoryError: null, toast: `Preparing a board for ${target.username}…` });
    const result = await rivalsClient.challenge({ targetProfileId: target.id, matchKey, pace });
    if (!result.ok) {
        store.patch({
            menuScreen: "rivals",
            socialBusy: false,
            rivalDirectoryError: result.error,
            toast: null,
        });
        return false;
    }
    correspondence.createOutgoingInvitation(matchKey, pace, result.target);
    await saveSystem.flush();
    store.patch({
        phase: "menu",
        menuScreen: "main",
        socialBusy: false,
        toast: `Board sent to ${result.target.username} — they move first.`,
    });
    return true;
}

/** Open one durable correspondence board. Only the match reference persists client-side. */
export async function startCorrespondenceMatch(input: {
    matchKey: string;
    pace: CorrespondencePace;
    roomCode?: string | null;
    isNew?: boolean;
}): Promise<boolean> {
    await rivalsClient.disconnect();
    const reconnectingInGame = store.get().phase === "playing" && store.get().activeMatchKey === input.matchKey;
    const reference = input.isNew ? null : correspondence.ensureReference(input.matchKey, input.pace);
    if (!input.isNew) correspondence.clearUnavailable(input.matchKey);
    store.patch({
        opponentMode: "online",
        onlineExperience: "async",
        activeMatchKey: input.matchKey,
        activeMatchPace: input.pace,
        onlineStatus: "connecting",
        onlineError: null,
        onlineRoomCode: null,
        onlineSeat: null,
        onlinePlayerCount: 0,
        matchSummary: null,
        pendingPromotion: false,
        thinking: true,
        socialBusy: true,
        toast: null,
    });

    const ok = await onlineChess.connectCorrespondence(
        input.matchKey,
        input.pace,
        input.roomCode ?? reference?.roomCode,
        correspondenceReservation(reference),
    );
    const snapshot = onlineChess.snapshot();
    store.patch({
        onlineStatus: snapshot.status,
        onlineRoomCode: snapshot.roomCode,
        onlineError: null,
        onlineSeat: snapshot.you,
        onlinePlayerCount: snapshot.playerCount,
        socialBusy: false,
        toast: ok ? (snapshot.status === "waiting" ? "Board ready — tap the code to copy it." : null) : null,
    });
    if (!ok) {
        const connectionError = snapshot.error ?? "We couldn’t reopen this board. Try again in a moment.";
        await onlineChess.leave();
        store.patch(
            reconnectingInGame
                ? {
                      onlineStatus: "error",
                      onlineError: connectionError,
                      onlineRoomCode: reference?.roomCode ?? null,
                      onlineSeat: reference?.color ?? null,
                      onlinePlayerCount: reference?.opponent ? 2 : 1,
                      activeMatchKey: input.matchKey,
                      activeMatchPace: input.pace,
                      onlineExperience: "async",
                      thinking: false,
                      socialBusy: false,
                      toast: null,
                  }
                : {
                      onlineStatus: "idle",
                      onlineError: null,
                      onlineRoomCode: null,
                      onlineSeat: null,
                      onlinePlayerCount: 0,
                      activeMatchKey: null,
                      activeMatchPace: null,
                      onlineExperience: "live",
                      thinking: false,
                      socialBusy: false,
                      toast: `${connectionError} Your saved board is safe.`,
                  },
        );
        return false;
    }

    // A failed preview/server connection must never leave a phantom card.
    // Persist the reference only after the authoritative room accepts it.
    correspondence.ensureReference(input.matchKey, input.pace);
    startMatch({ opponent: "online", difficulty: store.get().difficulty, playerColor: snapshot.you ?? "w" });
    store.patch({
        onlineExperience: "async",
        activeMatchKey: input.matchKey,
        activeMatchPace: input.pace,
        onlineStatus: snapshot.status,
        thinking: snapshot.status === "waiting" || snapshot.status === "connecting",
    });
    analytics.event("correspondence_match_opened", { pace: input.pace, phase: snapshot.phase ?? "waiting" });
    return true;
}

/** End a saved board authoritatively, then mirror its final state locally. */
export async function endCorrespondenceMatch(match: CorrespondenceMatch): Promise<boolean> {
    const directoryChallenge = match.phase === "waiting" && match.opponent !== null;
    if (directoryChallenge) {
        store.patch({ socialBusy: true, onlineError: null, toast: null });
        const cancelled = await rivalsClient.cancelChallenge(match.matchKey);
        if (!match.roomCode) {
            if (cancelled) correspondence.removeReference(match.matchKey);
            store.patch({
                socialBusy: false,
                toast: cancelled ? "Challenge cancelled for both players." : null,
            });
            return cancelled;
        }
    }
    await rivalsClient.disconnect();
    store.patch({ socialBusy: true, onlineError: null, toast: null });
    const connected = await onlineChess.connectCorrespondence(
        match.matchKey,
        match.pace,
        match.roomCode,
        correspondenceReservation(match),
    );
    if (!connected) {
        await onlineChess.leave();
        store.patch({
            socialBusy: false,
            onlineStatus: "idle",
            onlineError: null,
            toast: null,
        });
        return false;
    }
    const ended = await onlineChess.endMatch();
    if (ended) correspondence.sync(ended, onlineChess.snapshot());
    await onlineChess.leave();
    store.patch({
        socialBusy: false,
        onlineStatus: "idle",
        onlineRoomCode: null,
        onlineSeat: null,
        onlinePlayerCount: 0,
        activeMatchKey: null,
        activeMatchPace: null,
        onlineExperience: "live",
        toast: null,
    });
    return ended !== null;
}

/** Open RUN's tracked native share sheet for a generic friend board. */
export async function shareCorrespondenceInvite(match: CorrespondenceMatch): Promise<boolean> {
    if (!match.roomCode || match.phase !== "waiting" || match.opponent) return false;
    store.patch({ socialBusy: true, toast: null });
    const result = await shareRunLink({
        params: {
            route: "match",
            matchKey: match.matchKey,
            pace: match.pace,
            roomCode: match.roomCode,
        },
        title: "Your move in LUCIDMATE",
        description: `Join my ${match.pace === "daily" ? "daily" : "relaxed"} chess board. You play Black.`,
        slug: "lucidmate-friend-board",
    });
    store.patch({
        socialBusy: false,
        toast: result ? "Invite link ready to send." : "Sharing is available inside RUN.",
    });
    if (result) analytics.event("correspondence_invite_shared", { pace: match.pace });
    return result !== null;
}

export async function startCorrespondenceRematch(): Promise<boolean> {
    const state = store.get();
    const current = state.activeMatchKey
        ? state.correspondenceMatches.find((match) => match.matchKey === state.activeMatchKey)
        : null;
    if (!current) return false;
    const matchKey = current.rematchKey ?? correspondence.newRematchKey(current.pace);
    if (!current.rematchKey) {
        onlineChess.requestRematch(matchKey);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
    }
    analytics.event("correspondence_rematch_requested", { pace: current.pace });
    return startCorrespondenceMatch({ matchKey, pace: current.pace });
}

export async function leaveOnlineMatch(): Promise<void> {
    await onlineChess.leave();
    store.patch({
        onlineStatus: "idle",
        onlineRoomCode: null,
        onlineError: null,
        onlineSeat: null,
        onlinePlayerCount: 0,
        thinking: false,
        activeMatchKey: null,
        activeMatchPace: null,
        onlineExperience: "live",
        toast: null,
    });
}
