/**
 * Development QA hooks exposed on window for visual-qa scripts.
 */

import { ChessMatch } from "../game/chess/game.ts";
import { canUseAuthoritativeRealtime, onlineChess } from "../game/chess/onlineClient.ts";
import { serializeSoloMatch } from "../game/chess/soloSave.ts";
import { getChessScene, getRunController } from "../game/GameCanvas.tsx";
import { leaveOnlineMatch, startCorrespondenceMatch, startOnlineMatch } from "../game/runController.ts";
import { correspondence } from "../social/correspondence.ts";
import { type MenuScreen, store } from "../state/store.ts";

export function installBrowserQaContract(onLaunch: (params: Record<string, string>) => Promise<boolean>): void {
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
                selectedPieceStyle: state.selectedPieceStyle,
                thinking: state.thinking,
                onlineStatus: state.onlineStatus,
                onlineError: state.onlineError,
                onlineRoomCode: state.onlineRoomCode,
                onlineSeat: state.onlineSeat,
                onlinePlayerCount: state.onlinePlayerCount,
                onlineExperience: state.onlineExperience,
                activeMatchKey: state.activeMatchKey,
                socialBusy: state.socialBusy,
                rivalDirectoryStatus: state.rivalDirectoryStatus,
                rivalRecommendations: state.rivalRecommendations,
                rivalSearchResults: state.rivalSearchResults,
                rivalInvitations: state.rivalInvitations,
                correspondenceMatches: state.correspondenceMatches,
                savedSoloMatch: state.savedSoloMatch,
                joinBusyLabel: state.joinBusyLabel,
            };
        },
        previewJoinOverlay() {
            store.patch({
                phase: "menu",
                menuScreen: "main",
                joinBusyLabel: "Opening board…",
            });
        },
        previewSavedSolo() {
            const match = new ChessMatch({ playerColor: "w", opponent: "ai", difficulty: "trippy" });
            match.tapSquare(12);
            match.tapSquare(28);
            store.patch({
                phase: "menu",
                menuScreen: "main",
                matchSummary: null,
                savedSoloMatch: serializeSoloMatch(match),
            });
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
        /** Same path a RUN notification tap uses: extras → applyLaunchParams → board. */
        openFromLaunch(params: Record<string, string>) {
            return onLaunch(params);
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
        previewCandyPieces() {
            store.patch({ selectedPieceStyle: "candy" });
        },
        forceMenu() {
            store.patch({ phase: "menu", menuScreen: "main", matchSummary: null });
        },
        openMenu(screen: MenuScreen) {
            store.patch({ phase: "menu", menuScreen: screen, matchSummary: null });
        },
        previewLoading() {
            store.patch({ phase: "loading", loadProgress: 0.68 });
        },
        previewLobbyTurns() {
            const now = Date.now();
            store.patch({
                phase: "menu",
                menuScreen: "main",
                matchSummary: null,
                notificationsConsent: "granted",
                correspondenceMatches: [
                    {
                        matchKey: "lm-preview-your-move-001",
                        pace: "daily",
                        phase: "playing",
                        color: "w",
                        opponent: { id: "rival-mira", username: "Mira", avatarUrl: null },
                        turn: "w",
                        roomCode: "DREAM1",
                        deadlineAt: now + 7 * 3_600_000,
                        updatedAt: now,
                        moveCount: 18,
                        lastMove: { from: 21, to: 36 },
                        result: null,
                        reason: null,
                        reaction: null,
                        reactionUsedAtMove: null,
                        rematchKey: null,
                        credited: false,
                        reactionsMuted: false,
                        unavailable: false,
                        incoming: false,
                        challenger: false,
                    },
                    {
                        matchKey: "lm-preview-waiting-002",
                        pace: "relaxed",
                        phase: "playing",
                        color: "b",
                        opponent: { id: "rival-orion", username: "Orion", avatarUrl: null },
                        turn: "w",
                        roomCode: "COSMOS",
                        deadlineAt: now + 2 * 86_400_000,
                        updatedAt: now - 3_600_000,
                        moveCount: 11,
                        lastMove: { from: 52, to: 36 },
                        result: null,
                        reason: null,
                        reaction: null,
                        reactionUsedAtMove: null,
                        rematchKey: null,
                        credited: false,
                        reactionsMuted: false,
                        unavailable: false,
                        incoming: false,
                        challenger: false,
                    },
                ],
            });
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
                roomCode: "DREAM2",
                deadlineAt: null,
                updatedAt: now,
                moveCount: 0,
                lastMove: null,
                result: null,
                reason: null,
                reaction: null,
                reactionUsedAtMove: null,
                rematchKey: null,
                credited: false,
                reactionsMuted: false,
                unavailable: false,
                incoming: false,
                challenger: true,
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
                reactionUsedAtMove: null,
                rematchKey: null,
                credited: false,
                reactionsMuted: false,
                unavailable: false,
                incoming: false,
                challenger: false,
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
        previewResults() {
            store.patch({
                phase: "playing",
                opponentMode: "ai",
                playerColor: "w",
                matchStatus: "checkmate",
                matchesPlayed: 7,
                wins: 4,
                capturesLifetime: 62,
                bestWinStreak: 3,
                masteryBonusAuras: 40,
                matchSummary: {
                    status: "checkmate",
                    reason: "checkmate",
                    winner: "w",
                    result: "win",
                    movesPlayed: 31,
                    captures: 9,
                    checksGiven: 4,
                    aurasEarned: 28,
                    playerWon: true,
                },
            });
        },
        previewTimeoutResults() {
            store.patch({
                phase: "playing",
                opponentMode: "online",
                playerColor: "w",
                onlineExperience: "async",
                matchStatus: "checkmate",
                matchesPlayed: 7,
                wins: 4,
                capturesLifetime: 62,
                bestWinStreak: 3,
                masteryBonusAuras: 40,
                matchSummary: {
                    status: "checkmate",
                    reason: "timeout",
                    winner: "b",
                    result: "loss",
                    movesPlayed: 18,
                    captures: 5,
                    checksGiven: 2,
                    aurasEarned: 8,
                    playerWon: false,
                },
            });
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
