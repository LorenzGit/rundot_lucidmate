/** Every RUN identifier LUCIDMATE uses. */
export const PLATFORM_IDS = Object.freeze({
    gameId: "RuE1GRalg9GejuPtJD6t",

    /** Rewarded: free undo after a tough position. */
    rewardedFreeUndo: "lucidmate_free_undo_rewarded",
    /** Rewarded: free hint. */
    rewardedFreeHint: "lucidmate_free_hint_rewarded",
    /** Rewarded: double auras on the results card. */
    rewardedDoubleAuras: "lucidmate_double_auras_rewarded",
    /** Interstitial: after results, every third match. */
    interstitialBetweenMatches: "lucidmate_between_matches_interstitial",

    /** Shop items (rundot/shop.config.json → items[].itemId). */
    themePackItem: "lucidmate_theme_pack_cosmic",
    adFreeItem: "lucidmate_no_interstitials",
    tripPassItem: "lucidmate_trip_pass",

    /** Entitlements granted by those items. */
    themePackEntitlement: "lucidmate_theme_pack_cosmic",
    adFreeEntitlement: "lucidmate_no_interstitials",
    lavaThemeEntitlement: "lucidmate_theme_lava",
});

export function isConfiguredPlatformId(value: string): boolean {
    return value.length > 0 && !value.startsWith("REPLACE_WITH_");
}
