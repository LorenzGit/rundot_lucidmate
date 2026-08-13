import { correspondence } from "../social/correspondence.ts";
import { rivalSummaries } from "../social/model.ts";
import { useStore } from "../state/store.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

export default function RivalsScreen() {
    const matches = useStore((state) => state.correspondenceMatches);
    const rivals = rivalSummaries(matches);
    return (
        <MenuScreenLayout kicker="DREAMMATES" title="Your rivalries">
            {rivals.length ? (
                <div className="rival-list">
                    {rivals.map((rival) => {
                        const rivalryMatches = matches.filter((match) => match.opponent?.id === rival.id);
                        const muted =
                            rivalryMatches.length > 0 && rivalryMatches.every((match) => match.reactionsMuted);
                        return (
                            <article className="rival-card" key={rival.id}>
                                <span className="rival-avatar">{rival.username.slice(0, 1).toUpperCase()}</span>
                                <div>
                                    <p>
                                        {rival.active
                                            ? `${rival.active} ACTIVE BOARD${rival.active === 1 ? "" : "S"}`
                                            : `${rival.games} FINISHED`}
                                    </p>
                                    <h3>{rival.username}</h3>
                                    <span>
                                        You {rival.wins} · {rival.draws} draws · Them {rival.losses}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        for (const match of rivalryMatches) correspondence.toggleMute(match.matchKey);
                                        void runtimeServices.haptic("light");
                                    }}
                                >
                                    {muted ? "UNMUTE" : "MUTE"}
                                </button>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <section className="social-empty">
                    <span>♜</span>
                    <h3>No rivalries yet</h3>
                    <p>Finish a friend match and your shared record will live here.</p>
                </section>
            )}
            <section className="social-note">
                <strong>More than a win rate.</strong>
                <p>Every friend gets a persistent head-to-head record, active boards, and instant rematches.</p>
            </section>
        </MenuScreenLayout>
    );
}
