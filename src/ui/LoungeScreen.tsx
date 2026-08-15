/**
 * Theme lounge — buy/select trip skins with auras or RB.
 */
import { useEffect, useState } from "react";
import lucidmateRookbot from "../assets/art/lucidmate-rookbot.png";
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
import ThemeBoardPreview from "./ThemeBoardPreview.tsx";

function ProductArt({ productId }: { productId: ProductId }) {
    const themeIds =
        productId === "trip_pass"
            ? (["nebula", "ultraviolet", "lava"] as const)
            : productId === "theme_pack"
              ? (["nebula", "ultraviolet"] as const)
              : (["midnight"] as const);
    return (
        <div className={`shop-product-art ${productId}`} aria-hidden="true">
            {themeIds.map((id) => {
                const theme = THEMES.find((entry) => entry.id === id) ?? THEMES[0]!;
                return (
                    <ThemeBoardPreview
                        key={id}
                        theme={theme}
                        pieceStyle={productId === "piece_pack" ? "candy" : "dream"}
                        compact
                    />
                );
            })}
        </div>
    );
}

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
    const [previewThemeId, setPreviewThemeId] = useState(selected);
    const previewTheme = THEMES.find((theme) => theme.id === previewThemeId) ?? THEMES[0]!;

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
        <MenuScreenLayout kicker="CUSTOMIZE" title={t("MenuLounge")} artSrc={lucidmateRookbot} artVariant="rookbot">
            <section className="lounge-summary" aria-label={`${auras} auras available`}>
                <div>
                    <p>YOUR LOOK</p>
                    <strong>Dress up every board.</strong>
                    <span>Pieces and themes are cosmetic. Chess stays fair.</span>
                </div>
                <aside>
                    <i className="aura-glyph" aria-hidden="true" />
                    <strong>{auras}</strong>
                    <span>{t("LabelAuras")}</span>
                </aside>
            </section>
            <section className="store-preview-stage" aria-label={`Previewing ${previewTheme.name}`}>
                <ThemeBoardPreview theme={previewTheme} pieceStyle={selectedPieceStyle} />
                <div>
                    <p>LIVE PREVIEW</p>
                    <strong>{previewTheme.name}</strong>
                    <span>{previewTheme.blurb}</span>
                </div>
                <small>Tap any board below</small>
            </section>
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
                                <ThemeBoardPreview theme={previewTheme} pieceStyle={style.id} compact />
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
                            <button
                                type="button"
                                className="theme-preview-button"
                                aria-label={`Preview ${theme.name}`}
                                onClick={() => {
                                    audioManager.play("tap");
                                    void runtimeServices.haptic("light");
                                    setPreviewThemeId(theme.id);
                                }}
                            >
                                <ThemeBoardPreview theme={theme} compact />
                                <span>{previewThemeId === theme.id ? "PREVIEWING" : "TAP TO PREVIEW"}</span>
                            </button>
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
                            <ProductArt productId={view.productId} />
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
