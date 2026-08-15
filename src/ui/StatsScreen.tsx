import { useStore } from "../state/store.ts";
import { t } from "../systems/localization.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";
import { formatNumber } from "../systems/numberFormat.ts";

export default function StatsScreen() {
    const state = useStore((s) => s);
    const rows: Array<[string, string]> = [
        [t("StatWins"), formatNumber(state.wins)],
        [t("StatLosses"), formatNumber(state.losses)],
        [t("StatDraws"), formatNumber(state.draws)],
        [t("StatMatches"), formatNumber(state.matchesPlayed)],
        [t("StatCaptures"), formatNumber(state.capturesLifetime)],
        [t("StatWinStreak"), formatNumber(state.bestWinStreak)],
        [t("LabelAuras"), formatNumber(state.auras)],
    ];

    return (
        <MenuScreenLayout kicker={t("KickerStats")} title={t("MenuStats")}>
            <p className="screen-copy small">{t("StatsBody")}</p>
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
