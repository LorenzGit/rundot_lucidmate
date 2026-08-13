/**
 * Screen router. One phase visible at a time; 'playing' stacks HUD above Pixi.
 */
import { lazy, Suspense, useEffect } from "react";
import GameCanvas, { resyncSceneInsets } from "../game/GameCanvas.tsx";
import { applyRunSafeArea } from "../sdk/runSdk.ts";
import { store, useStore } from "../state/store.ts";
import DailyQuestsScreen from "./DailyQuestsScreen.tsx";
import DailyRewardsScreen from "./DailyRewardsScreen.tsx";
import DreamsScreen from "./DreamsScreen.tsx";
import Hud from "./Hud.tsx";
import LoadingScreen from "./LoadingScreen.tsx";
import LoungeScreen from "./LoungeScreen.tsx";
import MainMenu from "./MainMenu.tsx";
import SettingsScreen from "./SettingsScreen.tsx";
import StatsScreen from "./StatsScreen.tsx";
import PracticeScreen from "./PracticeScreen.tsx";
import ChallengeScreen from "./ChallengeScreen.tsx";
import RivalsScreen from "./RivalsScreen.tsx";
import LeagueScreen from "./LeagueScreen.tsx";
import MenuShaderBackground from "./MenuShaderBackground.tsx";

const DevelopmentTools = import.meta.env.DEV ? lazy(() => import("../dev/DevelopmentTools.tsx")) : null;

function useOrientationSafeArea(): void {
    useEffect(() => {
        let frame = 0;
        const refreshSafeArea = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                applyRunSafeArea();
                resyncSceneInsets();
            });
        };
        refreshSafeArea();
        window.addEventListener("orientationchange", refreshSafeArea, { passive: true });
        window.addEventListener("resize", refreshSafeArea, { passive: true });
        window.visualViewport?.addEventListener("resize", refreshSafeArea, { passive: true });
        window.visualViewport?.addEventListener("scroll", refreshSafeArea, { passive: true });

        const observer = new MutationObserver(refreshSafeArea);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style", "data-viewdeck-safe-area"],
        });

        return () => {
            window.cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener("orientationchange", refreshSafeArea);
            window.removeEventListener("resize", refreshSafeArea);
            window.visualViewport?.removeEventListener("resize", refreshSafeArea);
            window.visualViewport?.removeEventListener("scroll", refreshSafeArea);
        };
    }, []);
}

function MenuRoute() {
    const screen = useStore((state) => state.menuScreen);
    if (screen === "practice") return <PracticeScreen />;
    if (screen === "challenge") return <ChallengeScreen />;
    if (screen === "rivals") return <RivalsScreen />;
    if (screen === "league") return <LeagueScreen />;
    if (screen === "dreams") return <DreamsScreen />;
    if (screen === "lounge") return <LoungeScreen />;
    if (screen === "daily-rewards") return <DailyRewardsScreen />;
    if (screen === "daily-quests") return <DailyQuestsScreen />;
    if (screen === "stats") return <StatsScreen />;
    if (screen === "settings") return <SettingsScreen />;
    return <MainMenu />;
}

export default function App() {
    useOrientationSafeArea();
    const phase = useStore((s) => s.phase);
    return (
        <div id="app-frame">
            {phase === "loading" && <LoadingScreen />}
            {phase === "menu" && (
                <>
                    <MenuShaderBackground />
                    <MenuRoute />
                </>
            )}
            {phase === "playing" && (
                <div className="match-in absolute inset-0">
                    <GameCanvas />
                    <Hud />
                </div>
            )}
            <Toast />
            <DevelopmentToolsSlot />
        </div>
    );
}

function DevelopmentToolsSlot() {
    if (!DevelopmentTools || new URLSearchParams(window.location.search).get("debug") !== "1") return null;
    return (
        <Suspense fallback={null}>
            <DevelopmentTools />
        </Suspense>
    );
}

function Toast() {
    const toast = useStore((state) => state.toast);
    useEffect(() => {
        if (!toast) return;
        const timeout = window.setTimeout(() => store.patch({ toast: null }), 4_000);
        return () => window.clearTimeout(timeout);
    }, [toast]);
    if (!toast) return null;
    return (
        <button
            key={toast}
            type="button"
            className="toast"
            aria-live="polite"
            aria-label={`${toast}. Tap to dismiss.`}
            onClick={() => store.patch({ toast: null })}
        >
            {toast}
        </button>
    );
}
