/**
 * Theme ownership for LUCIDMATE trip skins.
 *
 * Earned themes live in the save. RB themes are proven by entitlements only.
 */
import { PLATFORM_IDS } from "../config/platform.ts";
import { DEFAULT_THEME, THEMES, type ThemeId } from "../game/art/palette.ts";
import { store } from "../state/store.ts";
import { entitlementsReady, hasEntitlement, onOwnershipChanged } from "./commerce.ts";
import { saveSystem } from "./save.ts";

export type ThemeUnlock =
    | { kind: "starter" }
    | { kind: "auras"; cost: number }
    | { kind: "entitlement"; entitlementId: string; via: string };

export interface ThemeOffer {
    id: ThemeId;
    name: string;
    blurb: string;
    unlock: ThemeUnlock;
}

export const THEME_OFFERS: readonly ThemeOffer[] = THEMES.map((entry) => {
    const unlock: ThemeUnlock =
        entry.id === "midnight"
            ? { kind: "starter" }
            : entry.id === "mango"
              ? { kind: "auras", cost: 80 }
              : entry.id === "mintwave"
                ? { kind: "auras", cost: 120 }
                : entry.id === "lava"
                  ? {
                        kind: "entitlement",
                        entitlementId: PLATFORM_IDS.lavaThemeEntitlement,
                        via: "TRIP PASS",
                    }
                  : {
                        kind: "entitlement",
                        entitlementId: PLATFORM_IDS.themePackEntitlement,
                        via: "THEME PACK",
                    };
    return { id: entry.id, name: entry.name, blurb: entry.blurb, unlock };
});

export function themeOffer(id: ThemeId): ThemeOffer | undefined {
    return THEME_OFFERS.find((entry) => entry.id === id);
}

export function themeIsOwned(id: ThemeId): boolean {
    const offer = themeOffer(id);
    if (!offer) return false;
    if (offer.unlock.kind === "starter") return true;
    if (offer.unlock.kind === "entitlement") return hasEntitlement(offer.unlock.entitlementId);
    return store.get().ownedThemes.includes(id);
}

export function ownedThemeIds(): ThemeId[] {
    return THEME_OFFERS.filter((offer) => themeIsOwned(offer.id)).map((offer) => offer.id);
}

export function enforceOwnedSelection(): void {
    if (!entitlementsReady()) return;
    const selected = store.get().selectedTheme;
    if (themeIsOwned(selected)) return;
    store.patch({ selectedTheme: DEFAULT_THEME });
    void saveSystem.flush();
}

export function buyThemeWithAuras(id: ThemeId): { ok: boolean; reason: string } {
    const offer = themeOffer(id);
    if (!offer || offer.unlock.kind !== "auras") return { ok: false, reason: "not-earn-able" };
    if (themeIsOwned(id)) return { ok: false, reason: "owned" };
    const state = store.get();
    if (state.auras < offer.unlock.cost) return { ok: false, reason: "broke" };
    store.patch({
        auras: state.auras - offer.unlock.cost,
        ownedThemes: [...new Set([...state.ownedThemes, id])],
        selectedTheme: id,
    });
    void saveSystem.flush();
    return { ok: true, reason: "bought" };
}

export function selectTheme(id: ThemeId): boolean {
    if (!themeIsOwned(id)) return false;
    store.patch({ selectedTheme: id });
    void saveSystem.flush();
    return true;
}

onOwnershipChanged(() => enforceOwnedSelection());

// Back-compat aliases used by leftover Atelier-era call sites during transition
export const paletteIsOwned = themeIsOwned;
export const ownedPaletteIds = ownedThemeIds;
export const paletteOffer = themeOffer;
export const PALETTE_OFFERS = THEME_OFFERS;
