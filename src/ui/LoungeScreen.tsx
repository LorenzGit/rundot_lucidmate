/**
 * Theme lounge — buy/select trip skins with auras or RB.
 */
import { useEffect, useState } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { THEMES } from "../game/art/palette.ts";
import { PIECE_STYLES } from "../game/art/pieceStyles.ts";
import { store, useStore } from "../state/store.ts";
import { analytics } from "../systems/analytics/analyticsConfig.ts";
import { productView, purchaseProduct, refreshCommerce } from "../systems/commerce.ts";
import { t } from "../systems/localization.ts";
import { monetizationTelemetry } from "../systems/monetization/runtime.ts";
import { PRODUCT_IDS, type ProductId } from "../systems/monetization/config.ts";
import { buyThemeWithAuras, selectTheme, themeIsOwned, themeOffer } from "../systems/palettes.ts";
import { pieceStyleIsOwned, selectPieceStyle } from "../systems/pieceStyles.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

export default function LoungeScreen() {
    useStore((s) => s.ownedThemes);
    useStore((s) => s.selectedTheme);
    useStore((s) => s.selectedPieceStyle);
    useStore((s) => s.auras);
    useStore((s) => s.locale);
    const auras = store.get().auras;
    const selected = store.get().selectedTheme;
    const selectedPieceStyle = store.get().selectedPieceStyle;
    const [busy, setBusy] = useState<string | null>(null);
    const [catalogRevision, setCatalogRevision] = useState(0);

    useEffect(() => {
        // Purchase funnel step 1: the monetization surface was actually seen.
        // Repeatable by design — every lounge visit counts (StrictMode's dev
        // double-mount is a dev-only artifact).
        analytics.funnelStep("purchase", 1);
        monetizationTelemetry.record("monetization_surface_viewed", { placement: "lounge" });
        void refreshCommerce().finally(() => setCatalogRevision((revision) => revision + 1));
    }, []);

    const checkout = async (productId: ProductId) => {
        await audioManager.unlock();
        audioManager.play("tap");
        void runtimeServices.haptic("medium");
        setBusy(productId);
        const outcome = await purchaseProduct(productId);
        setBusy(null);
        setCatalogRevision((revision) => revision + 1);

        if (!outcome) {
            audioManager.play("reject");
            void runtimeServices.haptic("error");
            store.patch({ toast: t("PurchaseUnavailable") });
            return;
        }
        if (outcome.status === "confirmed") {
            audioManager.play("reward");
            void runtimeServices.haptic("success");
            store.patch({ toast: t("PurchaseConfirmed") });
            return;
        }
        if (outcome.status === "cancelled") {
            store.patch({ toast: t("PurchaseCancelled") });
            return;
        }
        audioManager.play("reject");
        void runtimeServices.haptic(outcome.status === "unknown" ? "warning" : "error");
        store.patch({ toast: t(outcome.status === "unknown" ? "PurchasePending" : "PurchaseFailed") });
    };

    const productViews = PRODUCT_IDS.filter((productId) => productId !== "piece_pack")
        .map((productId) => productView(productId))
        .filter((view) => view.visible);

    return (
        <MenuScreenLayout kicker="CUSTOMIZE" title={t("MenuLounge")}>
            <p className="lounge-auras">Boards and pieces are cosmetic — chess stays fair.</p>
            <p className="lounge-auras">
                {t("LabelAuras")}: <strong>{auras}</strong>
            </p>
            <section className="piece-style-section" aria-labelledby="piece-style-title">
                <div className="piece-style-heading">
                    <div>
                        <p>YOUR PIECES</p>
                        <h3 id="piece-style-title">Pick a set for every board</h3>
                    </div>
                    <span>Cosmetic only</span>
                </div>
                <div className="piece-style-grid">
                    {PIECE_STYLES.map((style) => {
                        const owned = pieceStyleIsOwned(style.id);
                        const isSelected = selectedPieceStyle === style.id;
                        const view = style.id === "candy" ? productView("piece_pack") : null;
                        const select = () => {
                            audioManager.play("tap");
                            void runtimeServices.haptic("light");
                            selectPieceStyle(style.id);
                        };
                        return (
                            <article
                                key={style.id}
                                className={`piece-style-card ${style.id}${isSelected ? " selected" : ""}`}
                            >
                                <div className="piece-style-preview" aria-hidden="true">
                                    <i className="piece-preview pawn" />
                                    <i className="piece-preview king" />
                                    <i className="piece-preview pawn dark" />
                                </div>
                                <h4>{style.name}</h4>
                                <p>{style.blurb}</p>
                                {owned ? (
                                    <button type="button" disabled={isSelected} onClick={select}>
                                        {isSelected ? "SELECTED" : "USE THIS SET"}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={busy !== null || !view?.purchasable}
                                        onClick={() => void checkout("piece_pack")}
                                    >
                                        {busy === "piece_pack"
                                            ? t("PurchaseWorking")
                                            : (view?.priceLabel ?? "UNAVAILABLE")}
                                    </button>
                                )}
                            </article>
                        );
                    })}
                </div>
            </section>
            <div className="theme-grid">
                {THEMES.map((theme) => {
                    const offer = themeOffer(theme.id);
                    const owned = themeIsOwned(theme.id);
                    const isSelected = selected === theme.id;
                    const paidProductId: ProductId | null =
                        offer?.unlock.kind === "entitlement"
                            ? theme.id === "lava"
                                ? "trip_pass"
                                : "theme_pack"
                            : null;
                    const paidProduct = paidProductId ? productView(paidProductId) : null;
                    return (
                        <article key={theme.id} className={`theme-card${isSelected ? " selected" : ""}`}>
                            <div
                                className="theme-swatch"
                                style={{
                                    background: `linear-gradient(135deg, #${theme.dark.toString(16).padStart(6, "0")}, #${theme.accent.toString(16).padStart(6, "0")}, #${theme.accent2.toString(16).padStart(6, "0")})`,
                                }}
                            />
                            <h3>{theme.name}</h3>
                            <p>{theme.blurb}</p>
                            {owned ? (
                                <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={isSelected}
                                    onClick={() => {
                                        audioManager.play("tap");
                                        void runtimeServices.haptic("light");
                                        selectTheme(theme.id);
                                    }}
                                >
                                    {isSelected ? t("ThemeSelected") : t("ThemeSelect")}
                                </button>
                            ) : offer?.unlock.kind === "auras" ? (
                                <button
                                    type="button"
                                    className="play-button"
                                    onClick={() => {
                                        audioManager.play("tap");
                                        const result = buyThemeWithAuras(theme.id);
                                        if (!result.ok) {
                                            void runtimeServices.haptic("error");
                                            store.patch({
                                                toast: result.reason === "broke" ? t("NotEnoughAuras") : result.reason,
                                            });
                                        } else {
                                            audioManager.play("reward");
                                            void runtimeServices.haptic("success");
                                        }
                                    }}
                                >
                                    {t("ThemeUnlockAuras", { cost: offer.unlock.cost })}
                                </button>
                            ) : paidProductId && paidProduct ? (
                                <button
                                    type="button"
                                    className="play-button"
                                    disabled={busy !== null || !paidProduct.purchasable}
                                    onClick={() => void checkout(paidProductId)}
                                >
                                    {busy === paidProductId ? t("PurchaseWorking") : paidProduct.priceLabel}
                                </button>
                            ) : (
                                <span />
                            )}
                        </article>
                    );
                })}
            </div>

            <section className="lounge-products">
                <h3>{t("LoungeProducts")}</h3>
                <p>{t("LoungeProductsBody")}</p>
                <div className="lounge-products-grid" data-catalog-revision={catalogRevision}>
                    {productViews.map((view) => (
                        <article className="shop-card" key={view.productId}>
                            <p className="eyebrow">{view.statusLabel}</p>
                            <h3>{view.name}</h3>
                            <p>{view.description}</p>
                            <button
                                type="button"
                                disabled={busy !== null || view.owned || !view.purchasable}
                                onClick={() => void checkout(view.productId)}
                            >
                                {busy === view.productId
                                    ? t("PurchaseWorking")
                                    : view.owned
                                      ? t("ProductOwned")
                                      : view.priceLabel}
                            </button>
                        </article>
                    ))}
                </div>
                <p className="safety-note">{t("LoungeSafetyNote")}</p>
            </section>
        </MenuScreenLayout>
    );
}
