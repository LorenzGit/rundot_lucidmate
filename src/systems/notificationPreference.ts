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
    // Turning off is game-local. The host preference is the RUN app's, shared by
    // every game, so revoking it here would silence reminders in all of them —
    // a player switching LUCIDMATE's off means LUCIDMATE, not the platform.
    if (!enabled) {
        persist({ notificationsOptOut: true, notificationsEnabled: false });
        void returnReminders.cancelAll();
        return "disabled";
    }
    const result = await setNotificationPreference(true);
    if (result === "enabled") {
        persist({ notificationsOptOut: false, notificationsEnabled: true, notificationsConsent: "granted" });
        void refreshNotificationPermission().then(() => returnReminders.refreshAll());
    } else if (result === "disabled") {
        persist({ notificationsEnabled: false, notificationsConsent: "denied" });
    }
    return result;
}
