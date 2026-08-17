/**
 * Versioned persistence for LUCIDMATE.
 */
import { DEFAULT_THEME, isThemeId, THEMES, type ThemeId } from "../game/art/palette.ts";
import { DEFAULT_PIECE_STYLE, isPieceStyleId } from "../game/art/pieceStyles.ts";
import { getRunCapabilities, readAppStorage, writeAppStorage } from "../sdk/runSdk.ts";
import { type AppState, type PendingPurchaseIntent, store } from "../state/store.ts";
import { sanitizeMatches } from "../social/model.ts";

const SAVE_KEY = "lucidmate:save";
export const SAVE_VERSION = 3;

const QUEST_IDS = ["matches", "wins", "captures"] as const;

export interface GameSaveV3 {
    version: 3;
    settings: Pick<
        AppState,
        | "musicEnabled"
        | "musicVolume"
        | "sfxEnabled"
        | "sfxVolume"
        | "notificationsEnabled"
        | "notificationsOptOut"
        | "notificationsConsent"
        | "hapticsEnabled"
        | "reducedMotion"
        | "locale"
        | "quality"
    >;
    progress: Pick<
        AppState,
        | "auras"
        | "matchesPlayed"
        | "wins"
        | "losses"
        | "draws"
        | "capturesLifetime"
        | "bestWinStreak"
        | "currentWinStreak"
        | "ownedThemes"
        | "selectedTheme"
        | "selectedPieceStyle"
    >;
    setup: Pick<AppState, "opponentMode" | "difficulty" | "playerColor">;
    retention: Pick<
        AppState,
        | "dailyRewardLastClaimDay"
        | "dailyRewardStreak"
        | "dailyRewardClaimIds"
        | "dailyQuestDay"
        | "dailyQuestProgress"
        | "dailyQuestClaimIds"
    >;
    commerce: { pendingPurchaseIntent: PendingPurchaseIntent | null };
    social: Pick<AppState, "correspondenceMatches">;
}

export type SaveSource = "run" | "local" | "defaults";

function clamp01(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function enumOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(number))) : fallback;
}

function dayKeyOrNull(value: unknown): string | null {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function recentStrings(value: unknown, limit: number): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length <= 160).slice(-limit);
}

function migrateThemeId(value: unknown): ThemeId | null {
    if (value === "acid") return "midnight"; // renamed house theme
    return isThemeId(value) ? value : null;
}

function themeList(value: unknown): ThemeId[] {
    const known = new Set(THEMES.map((entry) => entry.id));
    const list = Array.isArray(value)
        ? value.map(migrateThemeId).filter((entry): entry is ThemeId => entry !== null)
        : [];
    const unique = [...new Set([DEFAULT_THEME, ...list])].filter((entry) => known.has(entry));
    return unique;
}

function pendingIntent(value: unknown): PendingPurchaseIntent | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<PendingPurchaseIntent>;
    if (
        typeof candidate.productId !== "string" ||
        typeof candidate.catalogItemId !== "string" ||
        typeof candidate.idempotencyKey !== "string" ||
        candidate.idempotencyKey.length === 0
    ) {
        return null;
    }
    return {
        productId: candidate.productId.slice(0, 64),
        catalogItemId: candidate.catalogItemId.slice(0, 128),
        idempotencyKey: candidate.idempotencyKey.slice(0, 128),
        startedAt: nonNegativeInteger(candidate.startedAt),
    };
}

function snapshot(): GameSaveV3 {
    const s = store.get();
    return {
        version: SAVE_VERSION,
        settings: {
            musicEnabled: s.musicEnabled,
            musicVolume: s.musicVolume,
            sfxEnabled: s.sfxEnabled,
            sfxVolume: s.sfxVolume,
            notificationsEnabled: s.notificationsEnabled,
            notificationsOptOut: s.notificationsOptOut,
            notificationsConsent: s.notificationsConsent,
            hapticsEnabled: s.hapticsEnabled,
            reducedMotion: s.reducedMotion,
            locale: s.locale,
            quality: s.quality,
        },
        progress: {
            auras: s.auras,
            matchesPlayed: s.matchesPlayed,
            wins: s.wins,
            losses: s.losses,
            draws: s.draws,
            capturesLifetime: s.capturesLifetime,
            bestWinStreak: s.bestWinStreak,
            currentWinStreak: s.currentWinStreak,
            ownedThemes: s.ownedThemes,
            selectedTheme: s.selectedTheme,
            selectedPieceStyle: s.selectedPieceStyle,
        },
        setup: {
            opponentMode: s.opponentMode,
            difficulty: s.difficulty,
            playerColor: s.playerColor,
        },
        retention: {
            dailyRewardLastClaimDay: s.dailyRewardLastClaimDay,
            dailyRewardStreak: s.dailyRewardStreak,
            dailyRewardClaimIds: s.dailyRewardClaimIds,
            dailyQuestDay: s.dailyQuestDay,
            dailyQuestProgress: s.dailyQuestProgress,
            dailyQuestClaimIds: s.dailyQuestClaimIds,
        },
        commerce: { pendingPurchaseIntent: s.pendingPurchaseIntent },
        social: { correspondenceMatches: s.correspondenceMatches },
    };
}

function defaults(): GameSaveV3 {
    return snapshot();
}

function migrate(raw: unknown): GameSaveV3 {
    const fallback = defaults();
    if (!raw || typeof raw !== "object") return fallback;
    const candidate = raw as Omit<Partial<GameSaveV3>, "version" | "social"> & {
        version?: number;
        social?: unknown;
    };
    if (candidate.version !== 1 && candidate.version !== 2 && candidate.version !== 3) return fallback;

    const progress = candidate.progress ?? fallback.progress;
    const settings = candidate.settings ?? fallback.settings;
    const setup = candidate.setup ?? fallback.setup;
    const retention = candidate.retention ?? fallback.retention;
    const commerce = candidate.commerce ?? fallback.commerce;

    const ownedThemes = themeList(progress.ownedThemes);
    const selectedTheme = migrateThemeId(progress.selectedTheme) ?? DEFAULT_THEME;

    const questProgress: Record<string, number> = {};
    if (retention.dailyQuestProgress && typeof retention.dailyQuestProgress === "object") {
        for (const id of QUEST_IDS) {
            questProgress[id] = nonNegativeInteger((retention.dailyQuestProgress as Record<string, unknown>)[id], 0);
        }
    }

    const notificationsConsent = enumOr(
        settings.notificationsConsent,
        ["unknown", "granted", "denied"] as const,
        "unknown",
    );

    return {
        version: 3,
        settings: {
            musicEnabled: booleanOr(settings.musicEnabled, true),
            musicVolume: clamp01(settings.musicVolume, 0.38),
            sfxEnabled: booleanOr(settings.sfxEnabled, true),
            sfxVolume: clamp01(settings.sfxVolume, 0.72),
            // Older saves wrote false before the player made a choice. Migrate
            // only that unknown state; an explicit denial stays off.
            notificationsEnabled:
                notificationsConsent === "unknown"
                    ? true
                    : booleanOr(settings.notificationsEnabled, notificationsConsent === "granted"),
            // Additive back-fill: saves written before the opt-out existed have
            // no field, and "absent" must mean "has not opted out". A player who
            // had switched reminders off carries notificationsEnabled === false,
            // so seed the opt-out from that rather than re-arming them.
            notificationsOptOut: booleanOr(
                settings.notificationsOptOut,
                notificationsConsent !== "unknown" && settings.notificationsEnabled === false,
            ),
            notificationsConsent,
            hapticsEnabled: booleanOr(settings.hapticsEnabled, true),
            reducedMotion: booleanOr(settings.reducedMotion, fallback.settings.reducedMotion),
            locale: typeof settings.locale === "string" ? settings.locale : "English",
            quality: enumOr(settings.quality, ["high", "low"] as const, "high"),
        },
        progress: {
            auras: nonNegativeInteger(progress.auras, 40),
            matchesPlayed: nonNegativeInteger(progress.matchesPlayed),
            wins: nonNegativeInteger(progress.wins),
            losses: nonNegativeInteger(progress.losses),
            draws: nonNegativeInteger(progress.draws),
            capturesLifetime: nonNegativeInteger(progress.capturesLifetime),
            bestWinStreak: nonNegativeInteger(progress.bestWinStreak),
            currentWinStreak: nonNegativeInteger(progress.currentWinStreak),
            ownedThemes,
            selectedTheme: ownedThemes.includes(selectedTheme) ? selectedTheme : DEFAULT_THEME,
            selectedPieceStyle: isPieceStyleId(progress.selectedPieceStyle)
                ? progress.selectedPieceStyle
                : DEFAULT_PIECE_STYLE,
        },
        setup: {
            opponentMode: enumOr(setup.opponentMode, ["ai", "local", "online"] as const, "ai"),
            difficulty: enumOr(setup.difficulty, ["chill", "trippy", "cosmic"] as const, "trippy"),
            playerColor: enumOr(setup.playerColor, ["w", "b"] as const, "w"),
        },
        retention: {
            dailyRewardLastClaimDay: dayKeyOrNull(retention.dailyRewardLastClaimDay),
            dailyRewardStreak: nonNegativeInteger(retention.dailyRewardStreak),
            dailyRewardClaimIds: recentStrings(retention.dailyRewardClaimIds, 32),
            dailyQuestDay: dayKeyOrNull(retention.dailyQuestDay),
            dailyQuestProgress: questProgress,
            dailyQuestClaimIds: recentStrings(retention.dailyQuestClaimIds, 16),
        },
        commerce: { pendingPurchaseIntent: pendingIntent(commerce.pendingPurchaseIntent) },
        social: {
            correspondenceMatches:
                candidate.version >= 2 && candidate.social && typeof candidate.social === "object"
                    ? sanitizeMatches((candidate.social as { correspondenceMatches?: unknown }).correspondenceMatches)
                    : [],
        },
    };
}

function apply(save: GameSaveV3): void {
    store.patch({
        ...save.settings,
        ...save.progress,
        ...save.setup,
        ...save.retention,
        pendingPurchaseIntent: save.commerce.pendingPurchaseIntent,
        correspondenceMatches: save.social.correspondenceMatches,
    });
}

async function readRemote(): Promise<unknown | null> {
    const caps = getRunCapabilities();
    if (!caps.storage) return null;
    try {
        const result = await readAppStorage(SAVE_KEY);
        if (!result.ok || result.value == null || result.value === "") return null;
        return JSON.parse(result.value) as unknown;
    } catch {
        return null;
    }
}

function readLocal(): unknown | null {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeLocal(save: GameSaveV3): void {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
        /* quota / private mode */
    }
}

let flushTimer = 0;
let flushing = false;

export const saveSystem = {
    async load(): Promise<SaveSource> {
        const remote = await readRemote();
        if (remote != null) {
            apply(migrate(remote));
            writeLocal(snapshot());
            return "run";
        }
        const local = readLocal();
        if (local != null) {
            apply(migrate(local));
            return "local";
        }
        apply(defaults());
        return "defaults";
    },

    async flush(): Promise<boolean> {
        if (flushing) return false;
        flushing = true;
        try {
            const save = snapshot();
            writeLocal(save);
            const caps = getRunCapabilities();
            if (caps.storage) {
                try {
                    await writeAppStorage(SAVE_KEY, JSON.stringify(save));
                } catch {
                    /* host storage can fail; local already written */
                }
            }
            return true;
        } catch {
            return false;
        } finally {
            flushing = false;
        }
    },

    scheduleFlush(delayMs = 400): void {
        window.clearTimeout(flushTimer);
        flushTimer = window.setTimeout(() => {
            void saveSystem.flush();
        }, delayMs);
    },
};
