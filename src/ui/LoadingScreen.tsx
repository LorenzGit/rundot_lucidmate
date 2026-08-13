/**
 * Calm branded loading — wordmark + progress, no busy motif.
 */
import { GAME_NAME, GAME_TAGLINE } from "../game/constants.ts";
import { useStore } from "../state/store.ts";
import { t } from "../systems/localization.ts";

export default function LoadingScreen() {
    const progress = useStore((s) => s.loadProgress);
    const pct = Math.round(progress * 100);
    return (
        <main className="loading-screen pt-safe-top pb-safe-bottom">
            <div className="loading-mark" aria-hidden="true">
                <span className="loading-knight" />
            </div>
            <div className="loading-title">
                <strong>{GAME_NAME}</strong>
                <span>{GAME_TAGLINE}</span>
            </div>
            <div className="loading-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="loading-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="loading-copy">
                {t("LoadingCopy")} {pct}%
            </p>
        </main>
    );
}
