import { useState } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { type AppState, store, useStore } from "../state/store.ts";
import { LOCALES, selectLocale, t } from "../systems/localization.ts";
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
            store.patch({ toast: result === "unavailable" ? t("SettingsUnavailable") : t("NotificationFailed") });
        }
    };

    const setLocale = (locale: string) => {
        audioManager.play("tap");
        void runtimeServices.haptic("light");
        selectLocale(locale);
    };

    const testHaptic = async () => {
        await audioManager.unlock();
        audioManager.play("reward");
        const sent = await runtimeServices.haptic("success");
        store.patch({ toast: sent ? t("HapticSent") : t("HapticUnsupported") });
    };

    const testNotifications = async () => {
        await audioManager.unlock();
        setNotificationTestBusy(true);
        setNotificationTestStatus("NotificationTestStarting");
        audioManager.play("tap");
        void runtimeServices.haptic("light");

        if (!turnAlertsOn) {
            const preference = await updateNotificationPreference(true);
            if (preference !== "enabled") {
                setNotificationTestStatus(
                    preference === "unavailable" ? "NotificationTestUnavailable" : "NotificationTestFailed",
                );
                setNotificationTestBusy(false);
                audioManager.play("reject");
                void runtimeServices.haptic("error");
                return;
            }
        }

        const result: NotificationSelfTestResult = await requestNotificationSelfTest();
        const statusKey: Record<NotificationSelfTestResult, string> = {
            scheduled: "NotificationTestScheduled",
            push_only: "NotificationTestPushOnly",
            inbox_only: "NotificationTestInboxOnly",
            unavailable: "NotificationTestUnavailable",
            failed: "NotificationTestFailed",
        };
        setNotificationTestStatus(statusKey[result]);
        setNotificationTestBusy(false);
        const success = result === "scheduled";
        audioManager.play(success ? "reward" : result === "failed" ? "reject" : "tap");
        void runtimeServices.haptic(success ? "success" : result === "failed" ? "error" : "warning");
    };

    const testInAppNotification = async () => {
        await audioManager.unlock();
        audioManager.play("tap");
        void runtimeServices.haptic("light");
        const shown = await showInAppNotificationTest(t("NotificationTestInAppMessage"));
        if (!shown) store.patch({ toast: t("NotificationTestUnavailable") });
    };

    return (
        <MenuScreenLayout title={t("MenuSettings")} kicker={t("KickerSettings")}>
            <div className="settings-list">
                <SettingToggle
                    label={t("SettingsMusic")}
                    checked={state.musicEnabled}
                    onChange={(value) => persist({ musicEnabled: value })}
                />
                <label className="setting-slider">
                    <span>{t("SettingsMusicVolume")}</span>
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
                    label={t("SettingsSfx")}
                    checked={state.sfxEnabled}
                    onChange={(value) => persist({ sfxEnabled: value })}
                />
                <label className="setting-slider">
                    <span>{t("SettingsSfxVolume")}</span>
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
                    <span>{t("SettingsHaptics")}</span>
                    <div className="setting-actions">
                        <input
                            aria-label={t("SettingsHaptics")}
                            type="checkbox"
                            checked={state.hapticsEnabled}
                            onChange={(event) => persist({ hapticsEnabled: event.target.checked })}
                        />
                        <button type="button" disabled={!state.hapticsEnabled} onClick={() => void testHaptic()}>
                            {t("ButtonTest")}
                        </button>
                    </div>
                </label>
                <SettingToggle
                    label={t("SettingsReducedMotion")}
                    checked={state.reducedMotion}
                    onChange={(value) => {
                        document.documentElement.dataset.reducedMotion = String(value);
                        persist({ reducedMotion: value });
                    }}
                />
                <label className="setting-row">
                    <span>{t("SettingsNotifications")}</span>
                    <button
                        type="button"
                        disabled={notificationBusy}
                        onClick={() => void notificationToggle(!turnAlertsOn)}
                    >
                        {notificationBusy
                            ? "…"
                            : turnAlertsOn
                              ? t("ToggleOn")
                              : state.notificationsEnabled
                                ? t("ToggleAsk")
                                : state.notificationsConsent === "denied"
                                  ? t("ToggleOff")
                                  : t("ToggleAsk")}
                    </button>
                </label>
                <label className="setting-row">
                    <span>{t("SettingsLanguage")}</span>
                    <select value={state.locale} onChange={(event) => setLocale(event.target.value)}>
                        {LOCALES.map((locale) => (
                            <option key={locale.id} value={locale.id}>
                                {locale.label}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="setting-row">
                    <span>{t("SettingsQuality")}</span>
                    <div className="segmented">
                        <button
                            type="button"
                            className={state.quality === "low" ? "active" : ""}
                            onClick={() => persist({ quality: "low" })}
                        >
                            {t("SettingsLow")}
                        </button>
                        <button
                            type="button"
                            className={state.quality === "high" ? "active" : ""}
                            onClick={() => persist({ quality: "high" })}
                        >
                            {t("SettingsHigh")}
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
                            {t("SettingsTestAlerts")}
                        </p>
                        <h3>{t("SettingsTestTitle")}</h3>
                    </div>
                </div>
                <p className="notification-test-copy">{t("SettingsTestCopy")}</p>
                <p className="notification-test-disclaimer">{t("SettingsTestDisclaimer")}</p>
                <div className="notification-test-actions">
                    <button
                        type="button"
                        className="notification-test-primary"
                        disabled={notificationTestBusy}
                        onClick={() => void testNotifications()}
                    >
                        {notificationTestBusy ? t("NotificationTestScheduling") : t("SettingsTestPhone")}
                    </button>
                    <button type="button" onClick={() => void testInAppNotification()}>
                        {t("SettingsTestInApp")}
                    </button>
                </div>
                {notificationTestStatus ? (
                    <p className="notification-test-status" role="status">
                        {t(notificationTestStatus)}
                    </p>
                ) : null}
            </section>
            <p className="safety-note">{t("NotificationConsentNote")}</p>
        </MenuScreenLayout>
    );
}
