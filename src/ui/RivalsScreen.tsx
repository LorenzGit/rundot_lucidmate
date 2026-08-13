import { useEffect, useMemo, useState } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { canUseAuthoritativeRealtime } from "../game/chess/onlineClient.ts";
import { challengeRival } from "../game/runController.ts";
import { correspondence } from "../social/correspondence.ts";
import { rivalSummaries, type RivalIdentity, type RivalSummary } from "../social/model.ts";
import { rivalsClient } from "../social/rivalsClient.ts";
import type { RivalDirectoryProfile } from "../social/rivalsProtocol.ts";
import { useStore } from "../state/store.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

function cue(): void {
    audioManager.play("tap");
    void runtimeServices.haptic("light");
}

function PlayerAvatar({ player }: { player: RivalIdentity }) {
    return player.avatarUrl ? (
        <img className="rival-avatar" src={player.avatarUrl} alt="" />
    ) : (
        <span className="rival-avatar" aria-hidden="true">
            {player.username.slice(0, 1).toUpperCase()}
        </span>
    );
}

function PlayerRow({
    player,
    detail,
    busy,
    onChallenge,
}: {
    player: RivalIdentity;
    detail: string;
    busy: boolean;
    onChallenge: () => void;
}) {
    return (
        <article className="rival-discovery-card">
            <PlayerAvatar player={player} />
            <div>
                <h3>{player.username}</h3>
                <p>{detail}</p>
            </div>
            <button type="button" disabled={busy} onClick={onChallenge}>
                CHALLENGE
            </button>
        </article>
    );
}

function historyDetail(rival: RivalSummary): string {
    if (rival.active) return `${rival.active} active ${rival.active === 1 ? "board" : "boards"}`;
    if (!rival.games) return "Played before";
    return `You ${rival.wins} · ${rival.draws} draws · Them ${rival.losses}`;
}

function recentDetail(player: RivalDirectoryProfile): string {
    const age = Math.max(0, Date.now() - player.lastSeenAt);
    if (age < 3_600_000) return "Recently played";
    if (age < 86_400_000) return "Played today";
    return "Community player";
}

export default function RivalsScreen() {
    const matches = useStore((state) => state.correspondenceMatches);
    const recommendations = useStore((state) => state.rivalRecommendations);
    const results = useStore((state) => state.rivalSearchResults);
    const directoryStatus = useStore((state) => state.rivalDirectoryStatus);
    const directoryError = useStore((state) => state.rivalDirectoryError);
    const busy = useStore((state) => state.socialBusy);
    const rivals = useMemo(() => rivalSummaries(matches), [matches]);
    const [query, setQuery] = useState("");
    const onlineReady = canUseAuthoritativeRealtime();

    useEffect(() => {
        rivalsClient.refresh();
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => rivalsClient.search(query), 220);
        return () => window.clearTimeout(timeout);
    }, [query]);

    const challenge = (player: RivalIdentity) => {
        cue();
        void challengeRival(player);
    };

    return (
        <MenuScreenLayout kicker="PLAY TOGETHER" title="Find a rival">
            <section className="rival-search social-panel">
                <label htmlFor="rival-search-input">SEARCH LUCIDMATE PLAYERS</label>
                <div>
                    <span aria-hidden="true">⌕</span>
                    <input
                        id="rival-search-input"
                        value={query}
                        placeholder="Type at least 2 letters"
                        autoComplete="off"
                        maxLength={40}
                        disabled={!onlineReady}
                        onChange={(event) => setQuery(event.currentTarget.value)}
                    />
                </div>
                <p>Searches people who have opened Lucidmate. Results never imply they are online.</p>
            </section>

            {!onlineReady && (
                <section className="rival-status-note" role="status">
                    Open Lucidmate in RUN to search players and send challenges.
                </section>
            )}
            {directoryError && (
                <section className="rival-status-note error" role="alert">
                    {directoryError}
                </section>
            )}

            {query.trim().length >= 2 ? (
                <section className="rival-section">
                    <header>
                        <h2>SEARCH RESULTS</h2>
                        <span>{directoryStatus === "connecting" ? "SEARCHING…" : `${results.length} FOUND`}</span>
                    </header>
                    <div className="rival-discovery-list">
                        {results.map((player) => (
                            <PlayerRow
                                key={player.id}
                                player={player}
                                detail={recentDetail(player)}
                                busy={busy || !onlineReady}
                                onChallenge={() => challenge(player)}
                            />
                        ))}
                        {directoryStatus === "ready" && results.length === 0 && (
                            <div className="rival-inline-empty">No Lucidmate player matches “{query.trim()}”.</div>
                        )}
                    </div>
                </section>
            ) : (
                <section className="rival-section">
                    <header>
                        <h2>PLAY SOMEONE NEW</h2>
                        <span>5 RECENT PLAYERS</span>
                    </header>
                    <div className="rival-discovery-list">
                        {recommendations.map((player) => (
                            <PlayerRow
                                key={player.id}
                                player={player}
                                detail={recentDetail(player)}
                                busy={busy || !onlineReady}
                                onChallenge={() => challenge(player)}
                            />
                        ))}
                        {onlineReady && directoryStatus === "ready" && recommendations.length === 0 && (
                            <div className="rival-inline-empty">
                                You’re early. Another Lucidmate player will appear here after they visit.
                            </div>
                        )}
                    </div>
                </section>
            )}

            {rivals.length > 0 && (
                <section className="rival-section history">
                    <header>
                        <h2>YOUR RIVALRIES</h2>
                        <span>{rivals.length}</span>
                    </header>
                    <div className="rival-list">
                        {rivals.map((rival) => {
                            const rivalryMatches = matches.filter((match) => match.opponent?.id === rival.id);
                            const muted =
                                rivalryMatches.length > 0 && rivalryMatches.every((match) => match.reactionsMuted);
                            return (
                                <article className="rival-card" key={rival.id}>
                                    <PlayerAvatar player={rival} />
                                    <div>
                                        <h3>{rival.username}</h3>
                                        <span>{historyDetail(rival)}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            for (const match of rivalryMatches)
                                                correspondence.toggleMute(match.matchKey);
                                            cue();
                                        }}
                                    >
                                        {muted ? "UNMUTE" : "MUTE"}
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}
        </MenuScreenLayout>
    );
}
