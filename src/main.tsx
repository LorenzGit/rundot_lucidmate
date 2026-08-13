import React from "react";
import { analytics } from "./systems/analytics/analyticsConfig.ts";
import { createRoot } from "react-dom/client";
import { warmAssets } from "./assets/preload.ts";
import { audioManager } from "./audio/audioManager.ts";
import { installBrowserQaContract } from "./qa/browserContract.ts";
import {
    applyRunSafeArea,
    initSdk,
    refreshRunCapabilities,
    registerLifecycles,
    requestHostExit,
} from "./sdk/runSdk.ts";
import { store } from "./state/store.ts";
import { restoreLocale } from "./systems/localization.ts";
import { runtimeServices } from "./systems/runtimeServices.ts";
import { saveSystem } from "./systems/save.ts";
import { correspondence } from "./social/correspondence.ts";
import { rivalsClient } from "./social/rivalsClient.ts";
import { leaveOnlineMatch, startCorrespondenceMatch } from "./game/runController.ts";
import App from "./ui/App.tsx";
import ErrorBoundary from "./ui/ErrorBoundary.tsx";
import "./styles/app.css";

import {
    refreshNotificationPermission,
    resolveReturnLaunch,
    returnReminders,
} from "./systems/retention/retentionConfig";
// Fired at module scope, before any await: this is the only row a player who
// closes the tab mid-load will ever produce. Emissions here are buffered until
// markTransportReady() below, once the SDK transport exists.
analytics.installErrorCapture();
analytics.funnelStep("load", 1);
/**
 * Boot sequence. The ORDER here matters — it's the pattern from a shipped RUN
 * game. Keep the numbered steps in this order; add your own work at the
 * marked points.
 */
async function boot() {
    // 1. SDK first. Nothing may call RundotGameAPI before this resolves.
    //    Resolves even if init fails (local dev outside the RUN host).
    await initSdk();
    // The transport exists now — flush everything boot recorded before this
    // point, then keep emitting in real time.
    analytics.markTransportReady();
    analytics.funnelStep("load", 2);
    applyRunSafeArea();

    // 2. Restore versioned progress/settings before the first render.
    await saveSystem.load();
    correspondence.refreshProfile();
    analytics.funnelStep("load", 3);
    document.documentElement.dataset.reducedMotion = String(store.get().reducedMotion);
    document.documentElement.dataset.quality = store.get().quality;
    restoreLocale();
    audioManager.bind();

    // Re-anchor return reminders only after the player's save and locale are
    // restored. Scheduling before this point used the default opt-out and
    // silently suppressed the whole cadence for opted-in returning players.
    void (async () => {
        await refreshNotificationPermission();
        await returnReminders.refreshAll();
        const reminderId = await resolveReturnLaunch();
        if (reminderId) store.patch({ menuScreen: "dreams" });
    })();

    // 3. Mount React. `phase` starts at 'loading', so this paints the
    //    loading screen (progress bar at 0%).
    const rootElement = document.getElementById("root");
    if (!rootElement) throw new Error("Missing required #root mount element");
    createRoot(rootElement).render(
        <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.StrictMode>,
    );

    // 4. Lift the boot cover once the loading screen has actually painted
    //    (double-rAF = after the next rendered frame). Asset warming continues
    //    behind it — the player watches the progress bar, not a black screen.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const cover = document.getElementById("boot-cover");
            if (!cover) return;
            cover.classList.add("hidden");
            setTimeout(() => cover.remove(), 400); // matches the CSS transition
        });
    });

    // 5. Warm all critical assets (see src/assets/manifest.ts). Deferred
    //    assets keep loading in the background after this resolves.
    await warmAssets((p) => store.patch({ loadProgress: p }));

    // 6. Loading done — a challenge/turn link lands directly on its board.
    // The shared match key routes both players to the same persistent authority.
    const launchMatch = await correspondence.resolveLaunchMatch();
    const launchReference = launchMatch
        ? store.get().correspondenceMatches.find((match) => match.matchKey === launchMatch.matchKey)
        : null;
    const launchRoomCode = launchMatch?.roomCode ?? launchReference?.roomCode;
    const launched = launchMatch
        ? await startCorrespondenceMatch({
              ...launchMatch,
              ...(launchRoomCode === undefined ? {} : { roomCode: launchRoomCode }),
          })
        : false;
    if (!launched) store.patch({ phase: "menu" });
    if (!launched) void rivalsClient.connect();
    if (import.meta.env.DEV) {
        const { applyDevelopmentScreenPreview } = await import("./dev/preview.ts");
        applyDevelopmentScreenPreview();
    }

    // 7. Host lifecycle hooks. Register AFTER boot so handlers never race
    //    half-initialized state.
    //    Lifecycle rules: persist on onSleep, never rely on
    //    onQuit firing, and never fire fresh SDK RPCs (e.g. scheduling
    //    notifications) from onSleep/onQuit — a hard close kills the runtime
    //    before they land.
    registerLifecycles({
        onPause: () => {
            store.patch({ paused: true });
            audioManager.setPaused(true);
            void saveSystem.flush();
        },
        onResume: () => {
            store.patch({ paused: false });
            audioManager.setPaused(false);
            runtimeServices.resume();
            void returnReminders.refreshAll();
            if (store.get().phase === "menu") rivalsClient.refresh();
        },
        onSleep: () => {
            analytics.sessionPause();
            store.patch({ paused: true });
            audioManager.setPaused(true);
            void saveSystem.flush();
        },
        onAwake: () => {
            store.patch({ paused: false });
            audioManager.setPaused(false);
            // onAwake is the SDK's "refresh stale data" hook; a long suspend
            // can span a settings change or a delayed host attach.
            refreshRunCapabilities();
            runtimeServices.resume();
            void returnReminders.refreshAll();
            if (store.get().phase === "menu") rivalsClient.refresh();
        },
        onQuit: () => {
            analytics.sessionEnd();
            void saveSystem.flush();
        },
        onIdentityChanged: (event) => {
            // Never flush the old account's in-memory state after the host has
            // switched identities. Reload and read the new identity's scope.
            if (event.idChanged) window.location.reload();
            else runtimeServices.resume();
        },
        onBackButton: () => {
            const state = store.get();
            if (state.phase === "playing") {
                if (state.opponentMode === "online") void leaveOnlineMatch();
                store.patch({ phase: "menu", menuScreen: "main", paused: false });
                void saveSystem.flush();
            } else if (state.menuScreen !== "main") {
                store.patch({ menuScreen: "main" });
            } else {
                void requestHostExit();
            }
        },
    });

    // 8. Post-boot, fire-and-forget: trusted time, LiveOps (which gates every
    //    monetization surface), the Shop catalog, entitlements, and any
    //    interrupted checkout. None of it blocks or throws into this function.
    runtimeServices.bootstrap();
    // Boot reached a playable frame; everything after this is the first-run funnel.
    analytics.funnelStep("load", 4);
    analytics.funnelStep("lucidmate_first_run", 1);
    analytics.sessionStart(store.get().matchesPlayed === 0);
    installBrowserQaContract();
}

function preventBrowserChrome(event: Event): void {
    const target = event.target;
    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
    ) {
        return;
    }
    event.preventDefault();
}

document.addEventListener("selectstart", preventBrowserChrome);
document.addEventListener("contextmenu", preventBrowserChrome);
document.addEventListener("dragstart", preventBrowserChrome);

// RUN treats an unhandled rejection as fatal. Every known async boundary is
// handled locally; this official last-resort guard protects against a missed
// third-party thenable while keeping the failure visible to developers.
window.addEventListener("unhandledrejection", (event) => {
    console.warn("[runtime] guarded unhandled rejection", event.reason);
    event.preventDefault();
});

function start(): void {
    void boot().catch((error) => {
        console.error("[boot] fatal startup failure", error);
        const root = document.getElementById("root");
        if (!root) return;
        const message = document.createElement("main");
        message.className = "fatal-error";
        message.setAttribute("role", "alert");
        const heading = document.createElement("h1");
        heading.textContent = "Unable to start";
        const guidance = document.createElement("p");
        guidance.textContent = "Reload to try again.";
        message.append(heading, guidance);
        root.replaceChildren(message);
    });
}

if (document.readyState === "complete") start();
else window.addEventListener("load", start, { once: true });
