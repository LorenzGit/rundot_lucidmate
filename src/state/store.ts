/**
 * Global UI state. The Pixi scene pushes match mirrors here; React reads them.
 */
import { useSyncExternalStore } from "react";
import type { AiDifficulty } from "../game/chess/ai.ts";
import type { OpponentMode } from "../game/chess/game.ts";
import type { Color, GameStatus, MatchSummary } from "../game/chess/types.ts";
import { DEFAULT_THEME, type ThemeId } from "../game/art/palette.ts";
import { DEFAULT_PIECE_STYLE, type PieceStyleId } from "../game/art/pieceStyles.ts";
import type { CorrespondenceMatch, CorrespondencePace } from "../social/model.ts";
import type { RivalDirectoryProfile, RivalInvitation } from "../social/rivalsProtocol.ts";

export type MenuScreen =
    | "main"
    | "practice"
    | "challenge"
    | "rivals"
    | "league"
    | "dreams"
    | "lounge"
    | "daily-rewards"
    | "daily-quests"
    | "stats"
    | "settings";

export interface PendingPurchaseIntent {
    productId: string;
    catalogItemId: string;
    idempotencyKey: string;
    startedAt: number;
}

export interface AppState {
    phase: "loading" | "menu" | "playing";
    loadProgress: number;
    paused: boolean;
    menuScreen: MenuScreen;

    /** Live match mirrors */
    matchStatus: GameStatus;
    turn: Color;
    thinking: boolean;
    movesPlayed: number;
    captures: number;
    canUndo: boolean;
    pendingPromotion: boolean;
    matchSummary: MatchSummary | null;
    freeHintReady: boolean;
    freeUndoReady: boolean;
    auraDoubled: boolean;
    masteryBonusAuras: number;

    /** Match setup */
    opponentMode: OpponentMode;
    difficulty: AiDifficulty;
    playerColor: Color;

    /** Online multiplayer surface */
    onlineMode: "create" | "join";
    onlineJoinCode: string;
    onlineStatus: "idle" | "connecting" | "waiting" | "playing" | "over" | "error" | "disconnected";
    onlineRoomCode: string | null;
    onlineError: string | null;
    onlineSeat: Color | null;
    onlinePlayerCount: number;
    onlineExperience: "live" | "async";
    activeMatchKey: string | null;
    activeMatchPace: CorrespondencePace | null;

    /** Durable social layer. Match moves remain authoritative in GameRoom. */
    correspondenceMatches: CorrespondenceMatch[];
    profileName: string;
    socialBusy: boolean;
    rivalDirectoryStatus: "idle" | "connecting" | "ready" | "error";
    rivalDirectoryError: string | null;
    rivalRecommendations: RivalDirectoryProfile[];
    rivalSearchQuery: string;
    rivalSearchResults: RivalDirectoryProfile[];
    rivalInvitations: RivalInvitation[];

    /** Progress */
    auras: number;
    matchesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    capturesLifetime: number;
    bestWinStreak: number;
    currentWinStreak: number;
    ownedThemes: ThemeId[];
    selectedTheme: ThemeId;
    selectedPieceStyle: PieceStyleId;

    /** Settings */
    musicEnabled: boolean;
    musicVolume: number;
    sfxEnabled: boolean;
    sfxVolume: number;
    notificationsEnabled: boolean;
    /**
     * The player's own "not in this game" choice, set only from Settings.
     * Separate from the host permission because that permission is shared by
     * every RUN game: turning reminders off here must not silence the others.
     */
    notificationsOptOut: boolean;
    notificationsConsent: "unknown" | "granted" | "denied";
    hapticsEnabled: boolean;
    reducedMotion: boolean;
    locale: string;
    quality: "high" | "low";

    toast: string | null;

    dailyRewardLastClaimDay: string | null;
    dailyRewardStreak: number;
    dailyRewardClaimIds: string[];
    dailyQuestDay: string | null;
    dailyQuestProgress: Record<string, number>;
    dailyQuestClaimIds: string[];

    pendingPurchaseIntent: PendingPurchaseIntent | null;

    runtimeReady: boolean;
    runtimeConfigVersion: string | null;
    trustedTimeReady: boolean;
}

const listeners = new Set<() => void>();

let state: AppState = {
    phase: "loading",
    loadProgress: 0,
    paused: false,
    menuScreen: "main",

    matchStatus: "playing",
    turn: "w",
    thinking: false,
    movesPlayed: 0,
    captures: 0,
    canUndo: false,
    pendingPromotion: false,
    matchSummary: null,
    freeHintReady: false,
    freeUndoReady: false,
    auraDoubled: false,
    masteryBonusAuras: 0,

    opponentMode: "ai",
    difficulty: "trippy",
    playerColor: "w",

    onlineMode: "join",
    onlineJoinCode: "",
    onlineStatus: "idle",
    onlineRoomCode: null,
    onlineError: null,
    onlineSeat: null,
    onlinePlayerCount: 0,
    onlineExperience: "live",
    activeMatchKey: null,
    activeMatchPace: null,

    correspondenceMatches: [],
    profileName: "Dreamer",
    socialBusy: false,
    rivalDirectoryStatus: "idle",
    rivalDirectoryError: null,
    rivalRecommendations: [],
    rivalSearchQuery: "",
    rivalSearchResults: [],
    rivalInvitations: [],

    auras: 40,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    capturesLifetime: 0,
    bestWinStreak: 0,
    currentWinStreak: 0,
    ownedThemes: [DEFAULT_THEME],
    selectedTheme: DEFAULT_THEME,
    selectedPieceStyle: DEFAULT_PIECE_STYLE,

    musicEnabled: true,
    musicVolume: 0.38,
    sfxEnabled: true,
    sfxVolume: 0.72,
    // Turn alerts are part of correspondence. The OS permission prompt still
    // waits for a player tap, as required by the host.
    notificationsEnabled: true,
    notificationsOptOut: false,
    notificationsConsent: "unknown",
    hapticsEnabled: true,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    locale: "English",
    quality: "high",

    toast: null,
    dailyRewardLastClaimDay: null,
    dailyRewardStreak: 0,
    dailyRewardClaimIds: [],
    dailyQuestDay: null,
    dailyQuestProgress: {},
    dailyQuestClaimIds: [],

    pendingPurchaseIntent: null,

    runtimeReady: false,
    runtimeConfigVersion: null,
    trustedTimeReady: false,
};

export const store = {
    get(): AppState {
        return state;
    },

    patch(partial: Partial<AppState>): void {
        state = { ...state, ...partial };
        for (const listener of listeners) listener();
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};

export function useStore<T>(selector: (s: AppState) => T): T {
    return useSyncExternalStore(
        store.subscribe,
        () => selector(store.get()),
        () => selector(store.get()),
    );
}
