import { useEffect, useMemo, useState } from "react";
import lucidmateFriendsBoard from "../assets/art/lucidmate-friends-board.png";
import lucidmateRookbot from "../assets/art/lucidmate-rookbot.png";
import { audioManager } from "../audio/audioManager.ts";
import { canUseAuthoritativeRealtime } from "../game/chess/onlineClient.ts";
import { challengeRival } from "../game/runController.ts";
import { correspondence } from "../social/correspondence.ts";
import { rivalSummaries, type RivalIdentity, type RivalSummary } from "../social/model.ts";
import { rivalryLevel } from "../social/rivalry.ts";
import { rivalsClient } from "../social/rivalsClient.ts";
import type { RivalDirectoryProfile } from "../social/rivalsProtocol.ts";
import { useStore } from "../state/store.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";
import ToyPieceIcon from "./ToyPieceIcon.tsx";

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
                    <ToyPieceIcon type={playerTone(player) === "coral" ? "q" : "n"} />
                </span>
            )}
            <i aria-hidden="true" />
        </span>
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
                        <img src={lucidmateFriendsBoard} alt="" aria-hidden="true" />
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
                                    busy={busy || !onlineReady || directoryStatus !== "ready"}
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
                                    busy={busy || !onlineReady || directoryStatus !== "ready"}
                                    onChallenge={() => challenge(player)}
                                />
                            ))}
                            {recommendations.length === 0 && (
                                <div className="rival-inline-empty rival-empty-cute">
                                    <img src={lucidmateRookbot} alt="" aria-hidden="true" />
                                    <div>
                                        <strong>
                                            {onlineReady ? "New rivals will appear here." : "Meet players in RUN."}
                                        </strong>
                                        <span>
                                            {onlineReady
                                                ? "Invite a friend while the rookbot keeps watch."
                                                : "Open Lucidmate in RUN to search and send a challenge."}
                                        </span>
                                    </div>
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
                                const level = rivalryLevel(rival.games);
                                const muted =
                                    rivalryMatches.length > 0 && rivalryMatches.every((match) => match.reactionsMuted);
                                return (
                                    <article className="rival-card" key={rival.id}>
                                        <PlayerAvatar player={rival} />
                                        <div>
                                            <h3>{rival.username}</h3>
                                            <span>{historyDetail(rival)}</span>
                                            <div className="rivalry-meter">
                                                <i
                                                    style={
                                                        { "--rival-progress": level.progress } as React.CSSProperties
                                                    }
                                                />
                                                <small>
                                                    Rivalry {level.level} · {level.name}
                                                    {level.next
                                                        ? ` · ${level.next - rival.games} to level ${level.level + 1}`
                                                        : ""}
                                                </small>
                                            </div>
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
