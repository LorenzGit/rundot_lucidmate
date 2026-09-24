import { useState } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { type AppState, store, useStore } from "../state/store.ts";
import {
    requestNotificationSelfTest,
    showInAppNotificationTest,
    type NotificationSelfTestResult,
} from "../sdk/runSdk.ts";
import { updateNotificationPreference } from "../systems/notificationPreference.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import { saveSystem } from "../systems/save.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";
import SettingToggle from "./SettingToggle.tsx";

function persist(patch: Partial<AppState>, cue = true): void {
    if (cue) {
        audioManager.play("tap");
        void runtimeServices.haptic("light");
    }
    store.patch(patch);
    void saveSystem.flush();
}

export default function SettingsScreen() {
    const state = useStore((value) => value);
    const [notificationBusy, setNotificationBusy] = useState(false);
    const [notificationTestBusy, setNotificationTestBusy] = useState(false);
    const [notificationTestStatus, setNotificationTestStatus] = useState<string | null>(null);
    const turnAlertsOn = state.notificationsEnabled && state.notificationsConsent === "granted";

    const notificationToggle = async (enabled: boolean) => {
        await audioManager.unlock();
        setNotificationBusy(true);
        const result = await updateNotificationPreference(enabled);
        setNotificationBusy(false);
        if (result === "enabled") {
            audioManager.play("reward");
        } else if (result === "disabled") {
            audioManager.play("tap");
        } else {
            audioManager.play("reject");
            store.patch({
                toast:
                    result === "unavailable" ? "Not available right now" : "Could not update notification preference",
            });
        }
    };

    const testHaptic = async () => {
        await audioManager.unlock();
        audioManager.play("reward");
        const sent = await runtimeServices.haptic("success");
        store.patch({ toast: sent ? "Haptic sent" : "Haptics unsupported here" });
    };

    const testNotifications = async () => {
        await audioManager.unlock();
        setNotificationTestBusy(true);
        setNotificationTestStatus("Contacting RUN…");
        audioManager.play("tap");
        void runtimeServices.haptic("light");

        if (!turnAlertsOn) {
            const preference = await updateNotificationPreference(true);
            if (preference !== "enabled") {
                const resultKey =
                    preference === "unavailable"
                        ? "Alert testing is available inside the RUN app."
                        : "No alert was scheduled. Check RUN notification permission and try again.";
                setNotificationTestStatus(resultKey);
                setNotificationTestBusy(false);
                audioManager.play("reject");
                void runtimeServices.haptic("error");
                return;
            }
        }

        const result: NotificationSelfTestResult = await requestNotificationSelfTest();
        const statusKey: Record<NotificationSelfTestResult, string> = {
            scheduled: "Scheduled. Close RUN now.",
            unavailable: "Alert testing is available inside the RUN app.",
            failed: "No alert was scheduled. Check RUN notification permission and try again.",
        };
        const resultKey = statusKey[result];
        setNotificationTestStatus(resultKey);
        setNotificationTestBusy(false);
        const success = result === "scheduled";
        audioManager.play(success ? "reward" : result === "failed" ? "reject" : "tap");
        void runtimeServices.haptic(success ? "success" : result === "failed" ? "error" : "warning");
    };

    const testInAppNotification = async () => {
        await audioManager.unlock();
        audioManager.play("tap");
        void runtimeServices.haptic("light");
        const shown = await showInAppNotificationTest("Lucidmate in-app alerts are working.");
        if (!shown) store.patch({ toast: "Alert testing is available inside the RUN app." });
    };

    return (
        <MenuScreenLayout title={"SETTINGS"} kicker={"CONTROLS"}>
            <div className="settings-list">
                <SettingToggle
                    label={"Music"}
                    checked={state.musicEnabled}
                    onChange={(value) => persist({ musicEnabled: value })}
                />
                <label className="setting-slider">
                    <span>{"Music volume"}</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={state.musicVolume}
                        onChange={(event) => persist({ musicVolume: Number(event.target.value) }, false)}
                    />
                </label>
                <SettingToggle
                    label={"Sound effects"}
                    checked={state.sfxEnabled}
                    onChange={(value) => persist({ sfxEnabled: value })}
                />
                <label className="setting-slider">
                    <span>{"SFX volume"}</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={state.sfxVolume}
                        onChange={(event) => persist({ sfxVolume: Number(event.target.value) }, false)}
                    />
                </label>
                <label className="setting-row">
                    <span>{"Haptics"}</span>
                    <div className="setting-actions">
                        <input
                            aria-label={"Haptics"}
                            type="checkbox"
                            checked={state.hapticsEnabled}
                            onChange={(event) => persist({ hapticsEnabled: event.target.checked })}
                        />
                        <button type="button" disabled={!state.hapticsEnabled} onClick={() => void testHaptic()}>
                            {"TEST"}
                        </button>
                    </div>
                </label>
                <SettingToggle
                    label={"Reduced motion"}
                    checked={state.reducedMotion}
                    onChange={(value) => {
                        document.documentElement.dataset.reducedMotion = String(value);
                        persist({ reducedMotion: value });
                    }}
                />
                <label className="setting-row">
                    <span>{"Notifications"}</span>
                    <button
                        type="button"
                        disabled={notificationBusy}
                        onClick={() => void notificationToggle(!turnAlertsOn)}
                    >
                        {notificationBusy
                            ? "…"
                            : turnAlertsOn
                              ? "ON"
                              : state.notificationsEnabled
                                ? "ASK"
                                : state.notificationsConsent === "denied"
                                  ? "OFF"
                                  : "ASK"}
                    </button>
                </label>
                <div className="setting-row">
                    <span>{"Graphics quality"}</span>
                    <div className="segmented">
                        <button
                            type="button"
                            className={state.quality === "low" ? "active" : ""}
                            onClick={() => persist({ quality: "low" })}
                        >
                            {"Low"}
                        </button>
                        <button
                            type="button"
                            className={state.quality === "high" ? "active" : ""}
                            onClick={() => persist({ quality: "high" })}
                        >
                            {"High"}
                        </button>
                    </div>
                </div>
            </div>
            <section className="notification-test-card" aria-labelledby="notification-test-heading">
                <div className="notification-test-heading">
                    <span className="notification-test-icon" aria-hidden="true">
                        <svg viewBox="0 0 48 48" aria-hidden="true">
                            <path d="M24 8c-7 0-12 5.3-12 12v6.2L8.5 31v3h31v-3L36 26.2V20c0-6.7-5-12-12-12Z" />
                            <path d="M19 38c1.2 2 2.8 3 5 3s3.8-1 5-3" />
                            <path
                                className="notification-test-ping"
                                d="M37 9c2 1.5 3.3 3.7 3.8 6.2M11 9c-2 1.5-3.3 3.7-3.8 6.2"
                            />
                        </svg>
                    </span>
                    <div>
                        <p className="eyebrow" id="notification-test-heading">
                            {"ALERT LAB"}
                        </p>
                        <h3>{"Make sure Lucidmate can find you."}</h3>
                    </div>
                </div>
                <p className="notification-test-copy">
                    {"A phone notification arrives in 5 seconds. This tests alert permission on this device."}
                </p>
                <p className="notification-test-disclaimer">
                    {
                        "Tap the test then close RUN immediately. Push + Inbox testing will appear after RUN adds remote game alerts."
                    }
                </p>
                <p className="notification-test-status" role="status">
                    {notificationTestStatus ?? "\u00a0"}
                </p>
                <div className="notification-test-actions">
                    <button
                        type="button"
                        className="notification-test-primary"
                        disabled={notificationTestBusy}
                        onClick={() => void testNotifications()}
                    >
                        {notificationTestBusy ? "SCHEDULING…" : "ALERT \u00b7 5 SEC"}
                    </button>
                    <button type="button" onClick={() => void testInAppNotification()}>
                        {"SHOW IN-APP"}
                    </button>
                </div>
            </section>
            <p className="safety-note">{"Notifications are optional and can be turned off anytime."}</p>
        </MenuScreenLayout>
    );
}
