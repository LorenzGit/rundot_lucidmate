/**
 * LUCIDMATE monetization decisions.
 */
import { PLATFORM_IDS } from "../../config/platform.ts";
import { createMonetizationPlan } from "./monetizationPlan.ts";
import { createPlacementRegistry } from "./placementRegistry.ts";
import { createProductRegistry } from "./productRegistry.ts";

export const monetizationPlan = createMonetizationPlan({
    model: "hybrid",
    nonPayerPromise:
        "Nothing purchasable changes chess rules, AI strength, or move legality. Three of six themes are free/earn-able with auras, and the only ad a non-payer cannot decline is one interstitial after every third completed match, from their second session onward.",
    purchaseArchitecture: "shop-entitlements",
    architectureRationale:
        "Durable cosmetic and ad-free unlocks need cross-device ownership, an order ledger, and refund handling.",
    firstExposure: {
        valueMoment:
            "The results card of the player's first finished match, where they see auras earned and the Lounge.",
        minCompletedSessions: 1,
        minProgression: 1,
    },
    primaryKpis: ["game_payer_conversion", "rewarded_completion_rate"],
    guardrails: {
        retention: "D1/D7 retention split by first-interstitial exposure cohort",
        sessionHealth: "matches per session before and after the first interstitial",
        economyHealth: "share of auras earned from rewarded video versus play",
        reliability: "purchase and ad error rate excluding player cancellation",
    },
});

export const PLACEMENT = {
    freeUndo: "free_undo",
    freeHint: "free_hint",
    doubleAuras: "double_auras",
    betweenMatches: "between_matches",
} as const;

export type PlacementId = (typeof PLACEMENT)[keyof typeof PLACEMENT];

export const PLACEMENT_DISPLAY_ID: Readonly<Record<PlacementId, string>> = {
    [PLACEMENT.freeUndo]: PLATFORM_IDS.rewardedFreeUndo,
    [PLACEMENT.freeHint]: PLATFORM_IDS.rewardedFreeHint,
    [PLACEMENT.doubleAuras]: PLATFORM_IDS.rewardedDoubleAuras,
    [PLACEMENT.betweenMatches]: PLATFORM_IDS.interstitialBetweenMatches,
};

export const placements = createPlacementRegistry([
    {
        id: PLACEMENT.freeUndo,
        displayName: "Free Undo",
        type: "rewarded",
        enabledByDefault: false,
        unlock: { minCompletedSessions: 1, minProgression: 1, requireValueMoment: true },
        cooldownSeconds: 0,
        sessionCap: 4,
        dailyCap: 10,
        subscriberPolicy: "same-as-free",
        noAdFallback: "disable-with-message",
        rewardId: "free_undo",
        rewardAmount: 1,
    },
    {
        id: PLACEMENT.freeHint,
        displayName: "Free Hint",
        type: "rewarded",
        enabledByDefault: false,
        unlock: { minCompletedSessions: 1, minProgression: 1, requireValueMoment: true },
        cooldownSeconds: 0,
        sessionCap: 4,
        dailyCap: 10,
        subscriberPolicy: "same-as-free",
        noAdFallback: "disable-with-message",
        rewardId: "free_hint",
        rewardAmount: 1,
    },
    {
        id: PLACEMENT.doubleAuras,
        displayName: "Double Auras",
        type: "rewarded",
        enabledByDefault: false,
        unlock: { minCompletedSessions: 1, minProgression: 1, requireValueMoment: true },
        cooldownSeconds: 30,
        sessionCap: 4,
        dailyCap: 12,
        subscriberPolicy: "same-as-free",
        noAdFallback: "disable-with-message",
        rewardId: "auras_double",
        rewardAmount: 1,
    },
    {
        id: PLACEMENT.betweenMatches,
        displayName: "Between Matches",
        type: "interstitial",
        enabledByDefault: false,
        unlock: { minCompletedSessions: 3, minProgression: 3, requireValueMoment: true },
        cooldownSeconds: 90,
        sessionCap: 2,
        dailyCap: 5,
        subscriberPolicy: "skip",
        noAdFallback: "hide",
        naturalBreak: "The player dismisses the results card and returns to the lounge",
        excludeFirstSession: true,
    },
]);

export const INTERSTITIAL_RUN_INTERVAL = 3;

export const products = createProductRegistry([
    {
        id: "theme_pack",
        catalogItemId: PLATFORM_IDS.themePackItem,
        kind: "durable",
        expectedEntitlementIds: [PLATFORM_IDS.themePackEntitlement],
        unique: true,
        unlockDescription: "Offered once the player has finished a match and opened the Lounge",
    },
    {
        id: "ad_free",
        catalogItemId: PLATFORM_IDS.adFreeItem,
        kind: "durable",
        expectedEntitlementIds: [PLATFORM_IDS.adFreeEntitlement],
        unique: true,
        unlockDescription: "Offered once the player has reached the interstitial cadence",
    },
    {
        id: "trip_pass",
        catalogItemId: PLATFORM_IDS.tripPassItem,
        kind: "bundle",
        expectedEntitlementIds: [
            PLATFORM_IDS.themePackEntitlement,
            PLATFORM_IDS.adFreeEntitlement,
            PLATFORM_IDS.lavaThemeEntitlement,
        ],
        unique: true,
        unlockDescription: "Offered alongside its two component products once either is eligible",
    },
]);

export type ProductId = "theme_pack" | "ad_free" | "trip_pass";

export const PRODUCT_IDS: readonly ProductId[] = ["theme_pack", "ad_free", "trip_pass"];

export const DEV_PREVIEW_PRICES: Readonly<Record<ProductId, string>> = {
    theme_pack: "199 RB",
    ad_free: "249 RB",
    trip_pass: "399 RB",
};

export const PRODUCT_UNLOCK_RUNS: Readonly<Record<ProductId, number>> = {
    theme_pack: 1,
    ad_free: 3,
    trip_pass: 3,
};
