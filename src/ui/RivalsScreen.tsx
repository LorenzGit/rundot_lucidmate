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

const RIVAL_TONES = ["sun", "mint", "coral", "sky", "berry"] as const;

function playerTone(player: RivalIdentity): (typeof RIVAL_TONES)[number] {
    let hash = 2_166_136_261;
    for (const character of player.id || player.username) {
        hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
    }
    return RIVAL_TONES[(hash >>> 0) % RIVAL_TONES.length] ?? "sun";
}

function PlayerAvatar({ player }: { player: RivalIdentity }) {
    return (
        <span className="rival-avatar-shell" data-tone={playerTone(player)}>
            {player.avatarUrl ? (
                <img className="rival-avatar" src={player.avatarUrl} alt="" />
            ) : (
                <span className="rival-avatar" aria-hidden="true">
                    {player.username.slice(0, 1).toUpperCase()}
                </span>
            )}
            <i aria-hidden="true" />
        </span>
    );
}

function RivalPartyGraphic() {
    return (
        <svg className="rival-party-graphic" viewBox="0 0 150 104" aria-hidden="true">
            <path className="rival-party-orbit" d="M27 63c20-35 73-47 99-17" />
            <circle className="rival-party-spark spark-one" cx="76" cy="18" r="4" />
            <path
                className="rival-party-spark spark-two"
                d="m119 16 2.2 5 5.2 2.2-5.2 2.2-2.2 5-2.2-5-5.2-2.2 5.2-2.2z"
            />
            <path
                className="rival-party-spark spark-three"
                d="m34 20 1.4 3.2 3.3 1.4-3.3 1.4-1.4 3.2-1.4-3.2-3.3-1.4 3.3-1.4z"
            />
            <g className="rival-party-piece piece-one">
                <circle cx="46" cy="58" r="28" />
                <path d="M34 75h26M37 69h20l-3.5-9.2c4-3.2 5.5-8.4 3.8-13.4C55.7 41.8 51.2 39 46 39s-9.7 2.8-11.3 7.4c-1.7 5 .1 10.5 4.1 13.7z" />
                <circle cx="41.5" cy="50" r="1.7" />
                <circle cx="50.5" cy="50" r="1.7" />
                <path d="M42 55.5c2.4 2 5.6 2 8 0" />
            </g>
            <g className="rival-party-piece piece-two">
                <circle cx="106" cy="66" r="30" />
                <path d="M91 83h31M94 76h25l-2.2-8.3c-1.2-4.8-5.1-8.4-10-9.3l-5-1 7.4-5.7-3-8.7-6.1 4.7-6.4-1.5 1.8 6.3c-5 3-7.1 8.1-5.5 14l1.4 5" />
                <circle cx="103.5" cy="50.5" r="1.8" />
            </g>
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6" />
            <path d="m15 15 4.5 4.5" />
        </svg>
    );
}

function ChallengeArrow() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h13M13 7l5 5-5 5" />
        </svg>
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
        <article className="rival-discovery-card" data-tone={playerTone(player)}>
            <PlayerAvatar player={player} />
            <div>
                <h3>{player.username}</h3>
                <p>{detail}</p>
            </div>
            <button type="button" aria-label={`Challenge ${player.username}`} disabled={busy} onClick={onChallenge}>
                <span>PLAY</span>
                <ChallengeArrow />
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
    const days = Math.max(0, Math.floor((Date.now() - player.lastSeenAt) / 86_400_000));
    if (days === 0) return "Recently active";
    if (days === 1) return "Active yesterday";
    if (days < 30) return `Active ${days} days ago`;
    return "Played before";
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
        <MenuScreenLayout kicker="PLAY ANYTIME" title="Pick a rival">
            <div className="rival-directory">
                <section className="rival-how-it-works social-panel">
                    <div className="rival-party-art">
                        <RivalPartyGraphic />
                    </div>
                    <div className="rival-party-copy">
                        <span>YOUR NEXT GAME</span>
                        <strong>Send a fun-sized chess challenge.</strong>
                        <p>They get White and move first. No one needs to be online.</p>
                    </div>
                </section>
                <section className="rival-search social-panel">
                    <label htmlFor="rival-search-input">FIND A PLAYER</label>
                    <div>
                        <span aria-hidden="true">
                            <SearchIcon />
                        </span>
                        <input
                            id="rival-search-input"
                            value={query}
                            placeholder="Search by name"
                            autoComplete="off"
                            maxLength={40}
                            disabled={!onlineReady}
                            onChange={(event) => setQuery(event.currentTarget.value)}
                        />
                    </div>
                    <p>Anyone who has played Lucidmate can be challenged.</p>
                </section>

                {!onlineReady && (
                    <section className="rival-status-note" role="status">
                        Connect in RUN to search and send challenges.
                    </section>
                )}
                {directoryError && (
                    <section className="rival-status-note error" role="alert">
                        {directoryError}
                    </section>
                )}

                {query.trim().length >= 2 ? (
                    <section className="rival-section featured">
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
                    <section className="rival-section featured">
                        <header>
                            <h2>PLAY SOMEONE NEW</h2>
                            <span>
                                {recommendations.length > 0 ? `${recommendations.length} PICKS` : "NEW PLAYERS"}
                            </span>
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
            </div>
        </MenuScreenLayout>
    );
}
