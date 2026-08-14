import { setNotificationPreference, type NotificationPreferenceResult } from "../sdk/runSdk.ts";
import { type AppState, store } from "../state/store.ts";
import { refreshNotificationPermission, returnReminders } from "./retention/retentionConfig.ts";
import { saveSystem } from "./save.ts";

function persist(patch: Partial<AppState>): void {
    store.patch(patch);
    void saveSystem.flush();
}

/**
 * One consent path for Settings and the match inbox. The SDK call is kept
 * behind a direct tap because enabling notifications may open the OS prompt.
 */
export async function updateNotificationPreference(enabled: boolean): Promise<NotificationPreferenceResult> {
    const result = await setNotificationPreference(enabled);
    if (result === "enabled") {
        persist({ notificationsEnabled: true, notificationsConsent: "granted" });
        void refreshNotificationPermission().then(() => returnReminders.refreshAll());
    } else if (result === "disabled") {
        persist({ notificationsEnabled: false, notificationsConsent: "denied" });
        void returnReminders.cancelAll();
    }
    return result;
}
