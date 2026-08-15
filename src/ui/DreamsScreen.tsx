import { useState } from "react";
import lucidmateDreamPath from "../assets/art/lucidmate-dream-path.png";
import lucidmateReactionStickers from "../assets/art/lucidmate-reaction-stickers.png";
import { audioManager } from "../audio/audioManager.ts";
import { store, useStore } from "../state/store.ts";
import { dailySystems } from "../systems/dailySystems.ts";
import { DREAM_RANKS, dreamMastery } from "../systems/mastery.ts";
import { formatNumber } from "../systems/numberFormat.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";
import ToyPieceIcon from "./ToyPieceIcon.tsx";

export default function DreamsScreen() {
    const state = useStore((value) => value);
    const [busy, setBusy] = useState<string | null>(null);
    const reward = dailySystems.rewardView();
    const quests = dailySystems.quests();
    const mastery = dreamMastery(state);
    const trophies = [
        {
            id: "first-board",
            label: "First Steps",
            detail: "Finish one board",
            value: state.matchesPlayed,
            target: 1,
            piece: "p" as const,
        },
        {
            id: "first-win",
            label: "Bright Idea",
            detail: "Win your first game",
            value: state.wins,
            target: 1,
            piece: "q" as const,
        },
        {
            id: "captures",
            label: "Sharp Eye",
            detail: "Capture 25 pieces",
            value: state.capturesLifetime,
            target: 25,
            piece: "n" as const,
        },
        {
            id: "streak",
            label: "On a Roll",
            detail: "Reach a 3-win streak",
            value: state.bestWinStreak,
            target: 3,
            piece: "r" as const,
        },
        {
            id: "collector",
            label: "Toy Collector",
            detail: "Own 3 board themes",
            value: state.ownedThemes.length,
            target: 3,
            piece: "k" as const,
        },
    ];

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
            <section className="dream-path-card" aria-label="Dream Path progress">
                <img src={lucidmateDreamPath} alt="" aria-hidden="true" />
                <div className="dream-path-copy">
                    <p>DREAM PATH</p>
                    <h3>{mastery.rankName}</h3>
                    {mastery.nextRankName ? (
                        <span>
                            {formatNumber(mastery.remaining)} insight to {mastery.nextRankName} · +
                            {formatNumber(mastery.nextReward)} auras
                        </span>
                    ) : (
                        <span>Every reward on the path is yours.</span>
                    )}
                    <progress value={mastery.progress} max={1} aria-label="Progress to next dream rank" />
                </div>
                <ul className="dream-path-nodes" aria-label="Dream ranks">
                    {DREAM_RANKS.map((rank, index) => (
                        <li
                            key={rank.name}
                            className={
                                index < mastery.rankIndex ? "unlocked" : index === mastery.rankIndex ? "current" : ""
                            }
                            title={`${rank.name}: ${formatNumber(rank.threshold)} insight`}
                        >
                            <i>{index + 1}</i>
                            <small>
                                {rank.name === "ONEIRONAUT"
                                    ? "ONEIRO"
                                    : rank.name === "ASCENDANT"
                                      ? "ASCEND"
                                      : rank.name}
                            </small>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="trophy-cabinet dreambook-section" aria-labelledby="trophy-title">
                <header className="dreambook-section-head">
                    <div>
                        <p>YOUR CABINET</p>
                        <h3 id="trophy-title">Tiny triumphs</h3>
                    </div>
                    <span>
                        {trophies.filter((trophy) => trophy.value >= trophy.target).length}/{trophies.length}
                    </span>
                </header>
                <div className="trophy-grid">
                    {trophies.map((trophy) => {
                        const earned = trophy.value >= trophy.target;
                        return (
                            <article key={trophy.id} className={earned ? "earned" : "locked"}>
                                <span>
                                    <ToyPieceIcon type={trophy.piece} />
                                </span>
                                <strong>{trophy.label}</strong>
                                <small>{earned ? "Collected" : trophy.detail}</small>
                                <progress value={Math.min(trophy.value, trophy.target)} max={trophy.target} />
                            </article>
                        );
                    })}
                </div>
                <div className="sticker-collection">
                    <img src={lucidmateReactionStickers} alt="" aria-hidden="true" />
                    <div>
                        <p>REACTION STICKERS</p>
                        <strong>Four friendly moods</strong>
                        <span>Send one after your rival moves. Your choices reset on your next turn.</span>
                    </div>
                </div>
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
