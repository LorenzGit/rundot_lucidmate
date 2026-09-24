import { useState } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { store, useStore } from "../state/store.ts";
import { dailySystems } from "../systems/dailySystems.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

export default function DailyQuestsScreen() {
    useStore(
        (state) =>
            `${JSON.stringify(state.dailyQuestProgress)}:${state.dailyQuestClaimIds.length}:${state.trustedTimeReady}`,
    );
    const [busyId, setBusyId] = useState<string | null>(null);
    const time = dailySystems.timeGate();
    const quests = dailySystems.quests();

    const claim = async (questId: string) => {
        await audioManager.unlock();
        setBusyId(questId);
        const result = await dailySystems.claimQuest(questId);
        setBusyId(null);
        store.patch({ toast: result.ok ? `+${result.auras} AURAS` : result.reason });
        if (result.ok) {
            audioManager.play("reward");
            void runtimeServices.haptic("success");
        } else audioManager.play("reject");
    };

    return (
        <MenuScreenLayout title={"TRIPS"} kicker={"TODAY'S TRIP"}>
            <p className="screen-copy">{"Three jobs a day. They reset with the trusted clock."}</p>
            <p className="authority-label">{time.label}</p>
            <div className="quest-list">
                {quests.map((quest) => (
                    <article className="quest-card" key={quest.id}>
                        <div>
                            <strong>{quest.label}</strong>
                            <span>
                                {Math.min(quest.value, quest.target)} / {quest.target}
                            </span>
                        </div>
                        <progress value={Math.min(quest.value, quest.target)} max={quest.target} />
                        <button
                            type="button"
                            disabled={busyId !== null || !quest.claimable}
                            onClick={() => void claim(quest.id)}
                        >
                            {busyId === quest.id
                                ? "SAVING…"
                                : quest.claimed
                                  ? "CLAIMED"
                                  : quest.claimable
                                    ? `CLAIM ${quest.reward} AURAS`
                                    : "IN PROGRESS"}
                        </button>
                    </article>
                ))}
            </div>
        </MenuScreenLayout>
    );
}
