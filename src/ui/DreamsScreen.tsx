import { useState } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { store, useStore } from "../state/store.ts";
import { dailySystems } from "../systems/dailySystems.ts";
import { dreamMastery } from "../systems/mastery.ts";
import { formatNumber } from "../systems/numberFormat.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

export default function DreamsScreen() {
    const state = useStore((value) => value);
    const [busy, setBusy] = useState<string | null>(null);
    const reward = dailySystems.rewardView();
    const quests = dailySystems.quests();
    const mastery = dreamMastery(state);

    const claimReward = async () => {
        await audioManager.unlock();
        setBusy("reward");
        const result = await dailySystems.claimDailyReward();
        setBusy(null);
        store.patch({ toast: result.ok ? `+${formatNumber(result.auras)} AURAS` : result.reason });
        if (result.ok) {
            audioManager.play("reward");
            void runtimeServices.haptic("success");
        } else audioManager.play("reject");
    };

    const claimQuest = async (questId: string) => {
        await audioManager.unlock();
        setBusy(questId);
        const result = await dailySystems.claimQuest(questId);
        setBusy(null);
        store.patch({ toast: result.ok ? `+${formatNumber(result.auras)} AURAS` : result.reason });
        if (result.ok) {
            audioManager.play("reward");
            void runtimeServices.haptic("success");
        } else audioManager.play("reject");
    };

    return (
        <MenuScreenLayout title="DREAMBOOK" kicker="RETURN WITH PURPOSE">
            <section className="dreambook-mastery" aria-label="Dream mastery">
                <div className="dreambook-rank-mark" aria-hidden="true">
                    <span>{mastery.rankIndex + 1}</span>
                </div>
                <div className="dreambook-rank-copy">
                    <p>DREAM RANK</p>
                    <h3>{mastery.rankName}</h3>
                    {mastery.nextRankName ? (
                        <span>
                            {formatNumber(mastery.remaining)} insight to {mastery.nextRankName} · +
                            {formatNumber(mastery.nextReward)} auras
                        </span>
                    ) : (
                        <span>Every path through the board is open.</span>
                    )}
                </div>
                <progress value={mastery.progress} max={1} aria-label="Progress to next dream rank" />
            </section>

            <section className="dreambook-section">
                <header className="dreambook-section-head">
                    <div>
                        <p>DAILY RETURN</p>
                        <h3>Seven-night aura chain</h3>
                    </div>
                    <span>{reward.streak} DAY</span>
                </header>
                <fieldset className="dreambook-chain">
                    <legend className="sr-only">Seven-day aura rewards</legend>
                    {[20, 25, 30, 40, 50, 60, 120].map((amount, index) => (
                        <span
                            key={amount}
                            className={reward.streak > 0 && (reward.streak - 1) % 7 === index ? "current" : ""}
                        >
                            <small>{index + 1}</small>
                            <strong>{amount}</strong>
                        </span>
                    ))}
                </fieldset>
                <button
                    type="button"
                    className="dreambook-claim"
                    disabled={busy !== null || !reward.ready || reward.claimed}
                    onClick={() => void claimReward()}
                >
                    {busy === "reward"
                        ? "SAVING…"
                        : reward.claimed
                          ? "COLLECTED TODAY"
                          : `COLLECT ${formatNumber(reward.reward)} AURAS`}
                </button>
                <p className="dreambook-authority">{reward.label}</p>
            </section>

            <section className="dreambook-section">
                <header className="dreambook-section-head">
                    <div>
                        <p>TODAY'S DREAMS</p>
                        <h3>Three ways forward</h3>
                    </div>
                    <span>{quests.filter((quest) => quest.claimed).length}/3</span>
                </header>
                <div className="dreambook-quests">
                    {quests.map((quest, index) => {
                        const value = Math.min(quest.value, quest.target);
                        return (
                            <article key={quest.id} className={quest.claimable ? "ready" : ""}>
                                <span className="dreambook-quest-index" aria-hidden="true">
                                    0{index + 1}
                                </span>
                                <div>
                                    <strong>{quest.label}</strong>
                                    <progress value={value} max={quest.target} />
                                    <small>
                                        {formatNumber(value)} / {formatNumber(quest.target)} · +
                                        {formatNumber(quest.reward)} auras
                                    </small>
                                </div>
                                <button
                                    type="button"
                                    disabled={busy !== null || !quest.claimable}
                                    onClick={() => void claimQuest(quest.id)}
                                >
                                    {busy === quest.id
                                        ? "…"
                                        : quest.claimed
                                          ? "DONE"
                                          : quest.claimable
                                            ? "CLAIM"
                                            : "GO"}
                                </button>
                            </article>
                        );
                    })}
                </div>
            </section>
        </MenuScreenLayout>
    );
}
