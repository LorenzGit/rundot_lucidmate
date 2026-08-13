import { analytics } from "../analytics/analyticsConfig";
import {
    cancelLocalNotification,
    notificationsEnabled,
    rearmLocalNotification,
    resolveLaunchIntent,
} from "../../sdk/runSdk";
import { RETURN_DELAYS_SECONDS, createReturnReminders } from "./returnReminders";
import { store } from "../../state/store";
import { dreamMastery } from "../mastery";

/**
 * Return reminders for lucidmate.
 *
 * Before this, the game had no way to reach a player once they closed it —
 * onboarding could convert perfectly and still produce no second session.
 *
 * The copy below is the actual product. Each body names the specific thing
 * waiting for this player; a generic "come back and play" is the wording that
 * gets muted, and muting is permanent. The cadence stops at 72h because a
 * fourth ping converts nobody and costs the permission the first three need.
 */

// Permission is read once at startup rather than per-schedule: the check is an
// async host round-trip and scheduling happens on the session-end path.
let notificationsGranted = false;

/** Refresh the cached permission. Call at startup and after any consent change. */
export async function refreshNotificationPermission(): Promise<boolean> {
    notificationsGranted = await notificationsEnabled();
    return notificationsGranted;
}

export const returnReminders = createReturnReminders({
    idPrefix: "lucidmate",
    reminders: () => {
        const state = store.get();
        const mastery = dreamMastery(state);
        const waitingMatch = state.correspondenceMatches.find(
            (match) => match.phase === "playing" && match.color === match.turn,
        );
        const questDefinitions = [
            { id: "matches", label: "finish 3 matches", target: 3 },
            { id: "wins", label: "win 2 matches", target: 2 },
            { id: "captures", label: "capture 12 pieces", target: 12 },
        ] as const;
        const closestQuest = questDefinitions
            .map((quest) => ({ ...quest, value: Math.min(state.dailyQuestProgress[quest.id] ?? 0, quest.target) }))
            .sort((a, b) => a.target - a.value - (b.target - b.value))[0]!;
        return [
            {
                id: "d1",
                title: waitingMatch
                    ? `Your move against ${waitingMatch.opponent?.username ?? "a friend"}`
                    : "Your daily auras are ready",
                body: waitingMatch
                    ? `${waitingMatch.pace === "daily" ? "Your 24-hour board" : "Your relaxed board"} is waiting for one move.`
                    : `Night ${Math.max(1, state.dailyRewardStreak + 1)} of your aura chain is waiting.`,
                delaySeconds: RETURN_DELAYS_SECONDS[0],
            },
            {
                id: "d2",
                title: "Today's dream is close",
                body: `${closestQuest.value}/${closestQuest.target}: ${closestQuest.label} for a fresh aura cache.`,
                delaySeconds: RETURN_DELAYS_SECONDS[1],
            },
            {
                id: "d3",
                title: `${mastery.nextRankName ?? mastery.rankName} is within sight`,
                body: mastery.nextRankName
                    ? `${mastery.remaining} insight remains. One match moves the dream rank forward.`
                    : "Your highest dream rank is awake. Keep the record growing.",
                delaySeconds: RETURN_DELAYS_SECONDS[2],
            },
        ];
    },
    schedule: (input) => rearmLocalNotification(input),
    cancel: (id) => cancelLocalNotification(id),
    resolveLaunch: () => resolveLaunchIntent(),
    // The cached permission annotates the scheduled event; it must never gate
    // scheduling. A stale or failed boot probe would otherwise silence the
    // whole cadence for the session, and a mid-session grant would never arm.
    // The settings toggle is a real player choice and does gate.
    isOptedOut: () => !store.get().notificationsEnabled,
    permissionHint: () => notificationsGranted,
    track: (event, payload) => analytics.event(event, payload),
});

/**
 * Resolve a notification-driven launch and record it. Call once at startup so
 * the return can be attributed to the reminder copy that earned it.
 */
export async function resolveReturnLaunch(): Promise<string | null> {
    const reminderId = await returnReminders.resolveLaunch();
    if (reminderId) analytics.event("retention_notification_return_play", { reminder_id: reminderId });
    return reminderId;
}
