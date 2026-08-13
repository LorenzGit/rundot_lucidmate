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
    if (qa && store.get().correspondenceMatches.length === 0) {
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
                        reaction: { id: "nice_move", from: "rival-mira", at: now - 1_000 },
                        rematchKey: null,
                        credited: false,
                        reactionsMuted: false,
                        unavailable: false,
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
                        rematchKey: null,
                        credited: false,
                        reactionsMuted: false,
                        unavailable: false,
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
                        reaction: { id: "good_game", from: "rival-sol", at: now - 86_000_000 },
                        rematchKey: null,
                        credited: true,
                        reactionsMuted: false,
                        unavailable: false,
                    },
                ],
            });
        }
    }
    if (!requested) return;
    if (requested === "game") {
        store.patch({ phase: "playing", menuScreen: "main", paused: false });
        return;
    }
    if (MENU_SCREENS.has(requested as MenuScreen)) {
        store.patch({ phase: "menu", menuScreen: requested as MenuScreen, paused: false });
        return;
    }
    console.warn(`[dev] Unknown screen preview "${requested}".`);
}
