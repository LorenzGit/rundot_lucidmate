import lucidmateRookbot from "../assets/art/lucidmate-rookbot.png";
import { audioManager } from "../audio/audioManager.ts";
import { startMatch } from "../game/runController.ts";
import { store, useStore } from "../state/store.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import { saveSystem } from "../systems/save.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

const levels = [
    { id: "chill" as const, label: "Easy", copy: "Quick, forgiving replies. Best for learning." },
    { id: "trippy" as const, label: "Standard", copy: "Balanced tactics and pressure." },
    { id: "cosmic" as const, label: "Expert", copy: "Deepest search and toughest play." },
];

function feedback(): void {
    audioManager.play("tap");
    void runtimeServices.haptic("light");
}

export default function PracticeScreen() {
    const difficulty = useStore((state) => state.difficulty);
    const playerColor = useStore((state) => state.playerColor);
    const update = (patch: Parameters<typeof store.patch>[0]) => {
        feedback();
        store.patch(patch);
        saveSystem.scheduleFlush();
    };
    const play = () => {
        audioManager.play("start");
        void runtimeServices.haptic("medium");
        startMatch({ opponent: "ai", difficulty, playerColor });
    };
    return (
        <MenuScreenLayout kicker="PRIVATE BOARD" title="Practice chess" artSrc={lucidmateRookbot} artVariant="rookbot">
            <section className="social-panel practice-panel">
                <div className="social-section-title">
                    <p>AI DIFFICULTY</p>
                    <span>Choose your challenge</span>
                </div>
                <div className="practice-levels">
                    {levels.map((level) => (
                        <button
                            key={level.id}
                            type="button"
                            className={difficulty === level.id ? "selected" : ""}
                            onClick={() => update({ difficulty: level.id })}
                        >
                            <strong>{level.label}</strong>
                            <span>{level.copy}</span>
                            <i aria-hidden="true" />
                        </button>
                    ))}
                </div>
                <fieldset className="practice-side">
                    <legend>YOUR SIDE</legend>
                    <button
                        type="button"
                        className={playerColor === "w" ? "selected" : ""}
                        onClick={() => update({ playerColor: "w" })}
                    >
                        <i className="dream-side white" />
                        White
                    </button>
                    <button
                        type="button"
                        className={playerColor === "b" ? "selected" : ""}
                        onClick={() => update({ playerColor: "b" })}
                    >
                        <i className="dream-side black" />
                        Black
                    </button>
                </fieldset>
                <button type="button" className="social-primary" onClick={play}>
                    PLAY {levels.find((level) => level.id === difficulty)?.label.toUpperCase()} AI
                </button>
            </section>
            <section className="social-panel practice-local">
                <div>
                    <p>ONE DEVICE</p>
                    <strong>Pass &amp; play</strong>
                    <span>Take turns across the table. No account needed.</span>
                </div>
                <button type="button" onClick={() => startMatch({ opponent: "local", difficulty, playerColor: "w" })}>
                    START
                </button>
            </section>
        </MenuScreenLayout>
    );
}
