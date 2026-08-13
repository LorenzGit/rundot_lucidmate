/**
 * Development QA hooks exposed on window for visual-qa scripts.
 */
import { getChessScene, getRunController } from "../game/GameCanvas.tsx";
import { canUseAuthoritativeRealtime, onlineChess } from "../game/chess/onlineClient.ts";
import { leaveOnlineMatch, startCorrespondenceMatch, startOnlineMatch } from "../game/runController.ts";
import { correspondence } from "../social/correspondence.ts";
import { store } from "../state/store.ts";

export function installBrowserQaContract(): void {
    if (!import.meta.env.DEV) return;
    const api = {
        snapshot() {
            const state = store.get();
            return {
                phase: state.phase,
                matchStatus: state.matchStatus,
                turn: state.turn,
                auras: state.auras,
                wins: state.wins,
                matchesPlayed: state.matchesPlayed,
                selectedTheme: state.selectedTheme,
                thinking: state.thinking,
                onlineStatus: state.onlineStatus,
                onlineError: state.onlineError,
                onlineRoomCode: state.onlineRoomCode,
                onlineSeat: state.onlineSeat,
                onlinePlayerCount: state.onlinePlayerCount,
                onlineExperience: state.onlineExperience,
                activeMatchKey: state.activeMatchKey,
                socialBusy: state.socialBusy,
                correspondenceMatches: state.correspondenceMatches,
            };
        },
        multiplayerReady() {
            return canUseAuthoritativeRealtime();
        },
        openCorrespondence(matchKey: string, pace: "daily" | "relaxed", roomCode?: string | null) {
            return startCorrespondenceMatch({
                matchKey,
                pace,
                ...(roomCode === undefined ? {} : { roomCode }),
            });
        },
        joinCode(roomCode: string) {
            return startOnlineMatch({ mode: "join", joinCode: roomCode });
        },
        previewJoinError() {
            store.patch({
                onlineJoinCode: "KJG32D",
                onlineError:
                    "You’re already connected to this board. To test both sides, join from a different RUN account.",
            });
        },
        sendOnlineMove(from: number, to: number) {
            return onlineChess.sendMove(from, to);
        },
        sendReaction(reaction: "nice_move" | "didnt_see_it" | "good_game" | "rematch") {
            return onlineChess.react(reaction);
        },
        leaveOnline() {
            return leaveOnlineMatch();
        },
        removeBoard(matchKey: string) {
            correspondence.removeReference(matchKey);
        },
        grantAuras(amount: number) {
            store.patch({ auras: Math.max(0, store.get().auras + Math.floor(amount)) });
        },
        setMatchesPlayed(amount: number) {
            store.patch({ matchesPlayed: Math.max(0, Math.floor(amount)) });
        },
        forceMenu() {
            store.patch({ phase: "menu", menuScreen: "main", matchSummary: null });
        },
        previewLocalGame() {
            store.patch({
                phase: "playing",
                opponentMode: "ai",
                playerColor: "w",
                onlineExperience: "live",
                onlineStatus: "idle",
                onlineRoomCode: null,
                onlineSeat: null,
                onlinePlayerCount: 0,
                matchSummary: null,
            });
        },
        previewOnlineWaiting() {
            const apply = () =>
                store.patch({
                    phase: "playing",
                    opponentMode: "online",
                    playerColor: "w",
                    turn: "w",
                    matchStatus: "playing",
                    matchSummary: null,
                    onlineExperience: "live",
                    onlineStatus: "connecting",
                    onlineRoomCode: "DP43XR",
                    onlineSeat: "w",
                    onlinePlayerCount: 1,
                });
            apply();
            window.requestAnimationFrame(apply);
            window.setTimeout(apply, 300);
            window.setTimeout(apply, 900);
        },
        previewCorrespondenceWaiting() {
            const now = Date.now();
            const match = {
                matchKey: "lm-preview-share-waiting-001",
                pace: "daily" as const,
                phase: "waiting" as const,
                color: "w" as const,
                opponent: null,
                turn: "w" as const,
                roomCode: null,
                deadlineAt: null,
                updatedAt: now,
                moveCount: 0,
                lastMove: null,
                result: null,
                reason: null,
                reaction: null,
                rematchKey: null,
                credited: false,
                reactionsMuted: false,
                unavailable: false,
            };
            const apply = () =>
                store.patch({
                    phase: "playing",
                    opponentMode: "online",
                    playerColor: "w",
                    turn: "w",
                    matchStatus: "playing",
                    matchSummary: null,
                    onlineExperience: "async",
                    onlineStatus: "waiting",
                    onlineRoomCode: match.roomCode,
                    onlineSeat: "w",
                    onlinePlayerCount: 1,
                    activeMatchKey: match.matchKey,
                    activeMatchPace: match.pace,
                    correspondenceMatches: [match],
                });
            apply();
            window.requestAnimationFrame(apply);
            window.setTimeout(apply, 300);
            window.setTimeout(apply, 900);
        },
        previewCorrespondenceGame() {
            const now = Date.now();
            const match = {
                matchKey: "lm-preview-reactions-001",
                pace: "daily" as const,
                phase: "playing" as const,
                color: "w" as const,
                opponent: { id: "rival-mira", username: "Mira", avatarUrl: null },
                turn: "w" as const,
                roomCode: "DREAM1",
                deadlineAt: now + 7 * 3_600_000,
                updatedAt: now,
                moveCount: 18,
                lastMove: { from: 21, to: 36 },
                result: null,
                reason: null,
                reaction: null,
                rematchKey: null,
                credited: false,
                reactionsMuted: false,
                unavailable: false,
            };
            const apply = () =>
                store.patch({
                    phase: "playing",
                    opponentMode: "online",
                    playerColor: "w",
                    turn: "w",
                    matchStatus: "playing",
                    matchSummary: null,
                    onlineExperience: "async",
                    onlineStatus: "playing",
                    onlineRoomCode: match.roomCode,
                    onlineSeat: "w",
                    onlinePlayerCount: 2,
                    activeMatchKey: match.matchKey,
                    activeMatchPace: match.pace,
                    correspondenceMatches: [match],
                });
            apply();
            window.requestAnimationFrame(apply);
            window.setTimeout(apply, 300);
        },
        previewConnectionFailure() {
            this.previewCorrespondenceGame();
            const apply = () =>
                store.patch({
                    onlineStatus: "disconnected",
                    onlineError: "The live connection paused.",
                    thinking: false,
                });
            window.requestAnimationFrame(apply);
            window.setTimeout(apply, 320);
        },
        controller() {
            return getRunController();
        },
        scene() {
            return getChessScene();
        },
        sceneGeometry() {
            return getChessScene()?.geometrySnapshot() ?? null;
        },
    };
    (window as unknown as { __LUCIDMATE_QA__?: typeof api }).__LUCIDMATE_QA__ = api;
}
