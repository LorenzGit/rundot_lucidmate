import { useStore } from "../state/store.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";
import { formatNumber } from "../systems/numberFormat.ts";

export default function StatsScreen() {
    const state = useStore((s) => s);
    const rows: Array<[string, string]> = [
        ["WINS", formatNumber(state.wins)],
        ["LOSSES", formatNumber(state.losses)],
        ["DRAWS", formatNumber(state.draws)],
        ["MATCHES", formatNumber(state.matchesPlayed)],
        ["CAPTURES", formatNumber(state.capturesLifetime)],
        ["BEST WIN STREAK", formatNumber(state.bestWinStreak)],
        ["AURAS", formatNumber(state.auras)],
    ];

    return (
        <MenuScreenLayout kicker={"TRIP LOG"} title={"STATS"}>
            <p className="screen-copy small">{"Everything you have played so far."}</p>
            <ul className="stats-list">
                {rows.map(([label, value]) => (
                    <li key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                    </li>
                ))}
            </ul>
        </MenuScreenLayout>
    );
}
