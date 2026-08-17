/**
 * Background platform work: LiveOps, trusted time, notifications, analytics,
 * haptics, and the commerce refresh.
 *
 * Everything here is fire-and-forget and fails closed. Nothing in this module
 * may block boot or throw into gameplay.
 */
import packageJson from "../../package.json";
import {
    fetchLiveOps,
    getRunCapabilities,
    type HapticStyle,
    recordAnalytics,
    recordFunnelStep,
    triggerHaptic,
} from "../sdk/runSdk.ts";
import { store } from "../state/store.ts";
import { reconcilePendingPurchase, refreshCommerce } from "./commerce.ts";
import { applyMonetizationLiveOps } from "./monetization/runtime.ts";
import { refreshServerTime } from "./serverTime.ts";

export interface RuntimeConfig {
    dailyRewardsEnabled: boolean;
    dailyQuestsEnabled: boolean;
}

const DEFAULTS: Readonly<RuntimeConfig> = Object.freeze({
    dailyRewardsEnabled: true,
    dailyQuestsEnabled: true,
});

let config: RuntimeConfig = { ...DEFAULTS };
let nextRefreshTimer = 0;

function clearScheduledRefresh(): void {
    if (!nextRefreshTimer) return;
    window.clearTimeout(nextRefreshTimer);
    nextRefreshTimer = 0;
}

function normalize(values: Record<string, unknown>): RuntimeConfig {
    const root =
        values.lucidmate_runtime && typeof values.lucidmate_runtime === "object"
            ? (values.lucidmate_runtime as Record<string, unknown>)
            : values;
    return {
        dailyRewardsEnabled: typeof root.dailyRewardsEnabled === "boolean" ? root.dailyRewardsEnabled : true,
        dailyQuestsEnabled: typeof root.dailyQuestsEnabled === "boolean" ? root.dailyQuestsEnabled : true,
    };
}

async function refreshLiveOps(): Promise<void> {
    clearScheduledRefresh();
    const snapshot = await fetchLiveOps();
    if (!snapshot) {
        // KEEP the live config (and monetization controls) on a failed fetch:
        // resetting to DEFAULTS here yanked an enabled shop/ads surface for
        // the rest of the session on a single resume-time network blip.
        // Monetization still fails closed at boot — its controls initialize
        // all-disabled until a real snapshot arrives. Retry only where a host
        // could actually answer; without the capability this null is permanent.
        store.patch({ runtimeReady: true });
        if (getRunCapabilities().liveops) {
            nextRefreshTimer = window.setTimeout(() => startRefreshCycle(), 60_000);
        }
        return;
    }
    config = normalize(snapshot.values);
    applyMonetizationLiveOps(snapshot.values);
    store.patch({ runtimeReady: true, runtimeConfigVersion: snapshot.configVersion });
    if (snapshot.nextChangeAt) {
        const delay = Math.max(1_000, Math.min(snapshot.nextChangeAt - Date.now() + 500, 2_147_000_000));
        nextRefreshTimer = window.setTimeout(() => startRefreshCycle(), delay);
    }
}

async function refreshTime(): Promise<void> {
    store.patch({ trustedTimeReady: await refreshServerTime() });
}

async function refreshRuntime(): Promise<void> {
    // LiveOps first: the monetization controls gate everything commerce shows.
    await Promise.allSettled([refreshTime(), refreshLiveOps()]);
    await refreshCommerce();
    await reconcilePendingPurchase();
}

function startRefreshCycle(): void {
    void refreshRuntime().catch((error) => {
        console.warn("[runtime] background refresh failed", error);
    });
}

export const runtimeServices = {
    get config(): Readonly<RuntimeConfig> {
        return config;
    },
    bootstrap(): void {
        startRefreshCycle();
        this.track("game_boot", { version: packageJson.version, host: getRunCapabilities().host });
        // Canonical core-loop name RUN's query filters on. The `game_loaded`
        // funnel step keeps its shipped name; this is the queryable event.
        this.track("game_opened", { version: packageJson.version });
    },
    resume(): void {
        startRefreshCycle();
    },
    track(eventName: string, payload: Record<string, unknown> = {}): void {
        void recordAnalytics(eventName, { ...payload, build_version: packageJson.version });
    },
    funnel(step: number, name: string, funnel: string, funnelOrder = 0): void {
        void recordFunnelStep(step, name, funnel, funnelOrder);
    },
    async haptic(style: HapticStyle): Promise<boolean> {
        return store.get().hapticsEnabled ? triggerHaptic(style) : false;
    },
};
