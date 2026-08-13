import { useStore } from "../state/store.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

const DIVISIONS = ["Moonseed", "Lucid", "Astral", "Cosmic"] as const;

export default function LeagueScreen() {
    const matches = useStore((state) => state.correspondenceMatches);
    const now = new Date();
    const mondayOffset = (now.getUTCDay() + 6) % 7;
    const weekStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset);
    const completed = matches.filter((match) => match.phase === "over" && match.updatedAt >= weekStart);
    const wins = completed.filter((match) => match.result === "win").length;
    const points = Math.max(0, wins * 3 + completed.filter((match) => match.result === "draw").length);
    const divisionIndex = Math.min(DIVISIONS.length - 1, Math.floor(points / 12));
    const division = DIVISIONS[divisionIndex];
    const nextAt = (divisionIndex + 1) * 12;
    const progress = divisionIndex === DIVISIONS.length - 1 ? 1 : (points % 12) / 12;
    return (
        <MenuScreenLayout kicker="WEEKLY LEAGUE" title="Dream Division">
            <section className="league-crest social-panel">
                <span aria-hidden="true">{divisionIndex + 1}</span>
                <div>
                    <p>YOUR DIVISION</p>
                    <h3>{division}</h3>
                    <em>{points} league points</em>
                </div>
                <progress value={progress} max={1} />
                <small>
                    {divisionIndex === DIVISIONS.length - 1
                        ? "Highest division reached"
                        : `${nextAt - points} points to ${DIVISIONS[divisionIndex + 1]}`}
                </small>
            </section>
            <section className="social-panel league-rules">
                <div className="social-section-title">
                    <p>HOW IT WORKS</p>
                    <span>Resets every Monday</span>
                </div>
                <ol>
                    <li>
                        <b>3</b>
                        <span>
                            <strong>Win a friend match</strong>
                            <small>Three league points</small>
                        </span>
                    </li>
                    <li>
                        <b>1</b>
                        <span>
                            <strong>Draw a friend match</strong>
                            <small>One league point</small>
                        </span>
                    </li>
                    <li>
                        <b>0</b>
                        <span>
                            <strong>No penalty for a loss</strong>
                            <small>Play boldly; the ladder stays friendly</small>
                        </span>
                    </li>
                </ol>
            </section>
            <section className="social-note">
                <strong>Your first circle is personal.</strong>
                <p>The league grows from real friend matches—never an empty public lobby or invented opponents.</p>
            </section>
        </MenuScreenLayout>
    );
}
