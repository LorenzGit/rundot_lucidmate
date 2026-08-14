import { type MenuScreen, store } from "../state/store.ts";

const MENU_SCREENS = new Set<MenuScreen>([
    "main",
    "practice",
    "challenge",
    "rivals",
    "league",
    "dreams",
    "lounge",
    "daily-rewards",
    "daily-quests",
    "stats",
    "settings",
]);

/**
 * Development-only deep link for visual review and automated browser checks.
 *
 * The query changes local in-memory navigation only; it never bypasses a RUN
 * permission, purchase, ad, entitlement, or other authoritative outcome.
 */
export function applyDevelopmentScreenPreview(): void {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    const qaPath = window.location.pathname === "/qa" || window.location.pathname.startsWith("/qa/");
    const pathScreen = qaPath ? window.location.pathname.split("/")[2] || null : null;
    const requested = params.get("screen") ?? pathScreen;
    const qa = params.get("qa") === "1" || qaPath;
    const socialPreview = params.get("socialPreview");
    if (qa && params.get("pieceStyle") === "candy") store.patch({ selectedPieceStyle: "candy" });
    if (
        qa &&
        (socialPreview === "waiting" ||
            socialPreview === "reconnecting" ||
            store.get().correspondenceMatches.length === 0)
    ) {
        const now = Date.now();
        if (socialPreview === "waiting") {
            store.patch({
                profileName: "Luna",
                correspondenceMatches: [
                    {
                        matchKey: "lm-preview-waiting-only-001",
                        pace: "daily",
                        phase: "waiting",
                        color: "w",
                        opponent: null,
                        turn: "w",
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
                    },
                ],
            });
        } else {
            store.patch({
                profileName: "Luna",
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
                        reaction: { id: "nice_move", from: "rival-mira", at: now - 1_000, moveCount: 17 },
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
                    {
                        matchKey: "lm-preview-final-003",
                        pace: "daily",
                        phase: "over",
                        color: "w",
                        opponent: { id: "rival-sol", username: "Sol", avatarUrl: null },
                        turn: "b",
                        roomCode: "NOVA42",
                        deadlineAt: null,
                        updatedAt: now - 86_400_000,
                        moveCount: 43,
                        lastMove: { from: 6, to: 21 },
                        result: "win",
                        reason: "checkmate",
                        reaction: { id: "good_game", from: "rival-sol", at: now - 86_000_000, moveCount: 43 },
                        reactionUsedAtMove: null,
                        rematchKey: null,
                        credited: true,
                        reactionsMuted: false,
                        unavailable: false,
                        incoming: false,
                        challenger: false,
                    },
                ],
            });
        }
    }
    if (!requested) return;
    if (requested === "game") {
        const waitingMatch =
            socialPreview === "waiting" ? store.get().correspondenceMatches.find((match) => !match.opponent) : null;
        const reconnectingMatch =
            socialPreview === "reconnecting" ? store.get().correspondenceMatches.find((match) => match.opponent) : null;
        if (reconnectingMatch?.color) {
            const reconnectingColor = reconnectingMatch.color;
            const apply = () =>
                store.patch({
                    phase: "playing",
                    menuScreen: "main",
                    paused: false,
                    opponentMode: "online",
                    playerColor: reconnectingColor,
                    turn: reconnectingMatch.turn,
                    matchStatus: "playing",
                    onlineExperience: "async",
                    onlineStatus: "connecting",
                    onlineRoomCode: reconnectingMatch.roomCode,
                    onlineSeat: reconnectingColor,
                    onlinePlayerCount: 2,
                    activeMatchKey: reconnectingMatch.matchKey,
                    activeMatchPace: reconnectingMatch.pace,
                });
            apply();
            window.requestAnimationFrame(apply);
            window.setTimeout(apply, 300);
            window.setTimeout(apply, 900);
            return;
        }
        if (waitingMatch?.color) {
            store.patch({
                phase: "playing",
                menuScreen: "main",
                paused: false,
                opponentMode: "online",
                playerColor: waitingMatch.color,
                turn: waitingMatch.turn,
                matchStatus: "playing",
                onlineExperience: "async",
                onlineStatus: "waiting",
                onlineRoomCode: waitingMatch.roomCode,
                onlineSeat: waitingMatch.color,
                onlinePlayerCount: 1,
                activeMatchKey: waitingMatch.matchKey,
                activeMatchPace: waitingMatch.pace,
            });
            return;
        }
        store.patch({ phase: "playing", menuScreen: "main", paused: false });
        return;
    }
    if (MENU_SCREENS.has(requested as MenuScreen)) {
        store.patch({
            phase: "menu",
            menuScreen: requested as MenuScreen,
            paused: false,
        });
        if (requested === "rivals" && qa) {
            const now = Date.now();
            store.patch({
                rivalDirectoryStatus: "ready",
                rivalRecommendations: [
                    { id: "rival-vela", username: "Vela", avatarUrl: null, lastSeenAt: now - 140_000 },
                    { id: "rival-nova", username: "NovaKnight", avatarUrl: null, lastSeenAt: now - 3_600_000 },
                    { id: "rival-kite", username: "Kite", avatarUrl: null, lastSeenAt: now - 82_000_000 },
                    { id: "rival-io", username: "Io", avatarUrl: null, lastSeenAt: now - 96_000_000 },
                    { id: "rival-ember", username: "Ember", avatarUrl: null, lastSeenAt: now - 190_000_000 },
                ],
            });
        }
        return;
    }
    console.warn(`[dev] Unknown screen preview "${requested}".`);
}
