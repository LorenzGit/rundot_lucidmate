import { useState } from "react";
import lucidmateFriendsBoard from "../assets/art/lucidmate-friends-board.png";
import { audioManager } from "../audio/audioManager.ts";
import { canUseAuthoritativeRealtime } from "../game/chess/onlineClient.ts";
import { startCorrespondenceMatch } from "../game/runController.ts";
import { correspondence } from "../social/correspondence.ts";
import type { CorrespondencePace } from "../social/model.ts";
import { store } from "../state/store.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

const paces = [
    { id: "daily" as const, label: "Daily", time: "24 hours per move", copy: "A steady game that keeps momentum." },
    { id: "relaxed" as const, label: "Relaxed", time: "3 days per move", copy: "Plenty of room for busy weeks." },
];

export default function ChallengeScreen() {
    const [pace, setPace] = useState<CorrespondencePace>("daily");
    const [busy, setBusy] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const onlineReady = canUseAuthoritativeRealtime();
    const create = async () => {
        if (busy || !onlineReady) return;
        setBusy(true);
        setCreateError(null);
        audioManager.play("start");
        void runtimeServices.haptic("medium");
        const matchKey = correspondence.createMatchKey();
        const opened = await startCorrespondenceMatch({ matchKey, pace, isNew: true });
        if (!opened) {
            setBusy(false);
            setCreateError("We couldn’t create the board. Check your connection and try again.");
            return;
        }
        store.patch({ toast: "Board ready — share its private invite link." });
    };
    return (
        <MenuScreenLayout kicker="NEW MATCH" title="Challenge a friend">
            <section className="challenge-hero social-panel">
                <img className="challenge-hero-art" src={lucidmateFriendsBoard} alt="" aria-hidden="true" />
                <div>
                    <p>CORRESPONDENCE CHESS</p>
                    <h3>Your friend gets the first move.</h3>
                    <span>Create a private link. They play White; you can both return anytime.</span>
                </div>
            </section>
            {onlineReady ? (
                <>
                    <section className="social-panel">
                        <div className="social-section-title">
                            <p>CHOOSE A PACE</p>
                            <span>There is no chess clock</span>
                        </div>
                        <div className="pace-options">
                            {paces.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={pace === option.id ? "selected" : ""}
                                    onClick={() => {
                                        setPace(option.id);
                                        void runtimeServices.haptic("light");
                                    }}
                                >
                                    <i aria-hidden="true" />
                                    <span>
                                        <strong>{option.label}</strong>
                                        <em>{option.time}</em>
                                        <small>{option.copy}</small>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                    <section className="challenge-safety">
                        <span aria-hidden="true">✦</span>
                        <p>
                            <strong>Friendly by design.</strong> Reactions use four safe chess phrases; there is no open
                            chat.
                        </p>
                    </section>
                    <div className="social-sticky-action">
                        {createError && (
                            <p className="challenge-create-error" role="alert">
                                {createError}
                            </p>
                        )}
                        <button type="button" className="social-primary" onClick={() => void create()} disabled={busy}>
                            {busy ? "CREATING BOARD…" : "CREATE BOARD"}
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <section className="multiplayer-preview-note" role="status" data-testid="multiplayer-preview-note">
                        <span aria-hidden="true">!</span>
                        <div>
                            <strong>Friend games aren’t connected here</strong>
                            <p>This preview can’t create or join real boards. You can still play the computer.</p>
                        </div>
                    </section>
                    <section className="preview-solo social-panel">
                        <p>READY TO PLAY?</p>
                        <h3>Start a game against the computer</h3>
                        <span>Choose Easy, Standard or Expert. No connection needed.</span>
                        <button
                            type="button"
                            className="social-primary"
                            onClick={() => {
                                store.patch({ menuScreen: "practice", toast: null });
                                audioManager.play("tap");
                                void runtimeServices.haptic("light");
                            }}
                        >
                            PLAY THE COMPUTER
                        </button>
                    </section>
                    <section className="preview-steps social-panel" aria-label="How friend games work">
                        <p>WHEN MULTIPLAYER IS CONNECTED</p>
                        <ol>
                            <li>
                                <b>1</b>
                                <span>Create a board and copy its 6-character code.</span>
                            </li>
                            <li>
                                <b>2</b>
                                <span>Your friend enters it under Join with code.</span>
                            </li>
                            <li>
                                <b>3</b>
                                <span>Take turns whenever it fits your day.</span>
                            </li>
                        </ol>
                    </section>
                </>
            )}
        </MenuScreenLayout>
    );
}
