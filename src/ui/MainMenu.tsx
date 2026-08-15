import packageJson from "../../package.json";
import { useEffect, useState } from "react";
import lucidmateFriendsBoard from "../assets/art/lucidmate-friends-board.png";
import lucidmateRookbot from "../assets/art/lucidmate-rookbot.png";
import { audioManager } from "../audio/audioManager.ts";
import { canUseAuthoritativeRealtime } from "../game/chess/onlineClient.ts";
import { GAME_NAME } from "../game/constants.ts";
import {
    endCorrespondenceMatch,
    leaveOnlineMatch,
    shareCorrespondenceInvite,
    startCorrespondenceMatch,
    startOnlineMatch,
} from "../game/runController.ts";
import { correspondence } from "../social/correspondence.ts";
import type { CorrespondenceMatch } from "../social/model.ts";
import { paceLabel } from "../social/model.ts";
import { rivalsClient } from "../social/rivalsClient.ts";
import { store, useStore } from "../state/store.ts";
import { dailySystems } from "../systems/dailySystems.ts";
import { formatNumber } from "../systems/numberFormat.ts";
import { updateNotificationPreference } from "../systems/notificationPreference.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import GearIcon from "./GearIcon.tsx";

const MINI_SQUARES = [
    "a4",
    "b4",
    "c4",
    "d4",
    "a3",
    "b3",
    "c3",
    "d3",
    "a2",
    "b2",
    "c2",
    "d2",
    "a1",
    "b1",
    "c1",
    "d1",
] as const;

function cue(action: () => void): void {
    action();
    void audioManager.unlock().then(() => {
        audioManager.play("tap");
        void runtimeServices.haptic("light");
    });
}

function JoinIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M13 5h6v14h-6M3 12h12M10 7l5 5-5 5" />
        </svg>
    );
}

function BellIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3Z" />
            <path d="M10 20h4" />
        </svg>
    );
}

function AuraIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 2.5 6.8 4.2L21 14l-9 7.5L3 14l2.2-7.3Z" />
            <path d="m5.2 6.7 6.8 7.8 6.8-7.8M3 14h18M12 2.5v12" />
        </svg>
    );
}

function MiniBoard({ match }: { match: CorrespondenceMatch }) {
    const accent = (match.lastMove?.to ?? match.matchKey.length * 7) % 16;
    return (
        <span className="inbox-mini-board" aria-hidden="true">
            {MINI_SQUARES.map((square, index) => (
                <i key={square} className={index === accent ? "hot" : ""}>
                    {index === accent ? (match.color === "b" ? "♞" : "♘") : ""}
                </i>
            ))}
        </span>
    );
}

function dueCopy(match: CorrespondenceMatch): string {
    if (match.unavailable) return "Tap to reconnect";
    if (match.phase === "waiting") return match.incoming ? "You play White" : "Waiting for their first move";
    if (match.phase === "over") {
        if (match.reason === "cancelled") return "Match ended";
        if (match.result === "win") return "You won";
        if (match.result === "loss") return "Rival won";
        return "Draw";
    }
    if (!match.deadlineAt) return paceLabel(match.pace);
    const remaining = Math.max(0, match.deadlineAt - Date.now());
    const hours = Math.max(1, Math.ceil(remaining / 3_600_000));
    return hours < 24 ? `${hours}h left` : `${Math.ceil(hours / 24)}d left`;
}

function matchStatus(match: CorrespondenceMatch, yourMove: boolean): string {
    if (match.unavailable) return "RECONNECT";
    if (match.phase === "waiting") return match.incoming ? "YOUR FIRST MOVE" : "CHALLENGE SENT";
    if (yourMove) return "YOUR MOVE";
    return match.phase === "over" ? "FINAL" : "WAITING";
}

function openMatch(match: CorrespondenceMatch): void {
    cue(() => store.patch({ socialBusy: true }));
    void (match.incoming ? rivalsClient.accept(match.matchKey) : Promise.resolve(true))
        .then((accepted) =>
            accepted
                ? startCorrespondenceMatch({
                      matchKey: match.matchKey,
                      pace: match.pace,
                      roomCode: match.roomCode,
                  })
                : false,
        )
        .then((ok) => {
            if (!ok) store.patch({ socialBusy: false });
        });
}

function TurnSpotlight({ matches }: { matches: CorrespondenceMatch[] }) {
    const primary = matches[0];
    if (!primary) return null;
    const opponent = primary.opponent?.username ?? "your friend";
    return (
        <button
            type="button"
            className="turn-spotlight"
            data-testid="turn-waiting-hero"
            onClick={() => openMatch(primary)}
        >
            <span className="turn-spotlight-board" aria-hidden="true">
                <MiniBoard match={primary} />
                <i>{matches.length}</i>
            </span>
            <span className="turn-spotlight-copy">
                <small>{matches.length === 1 ? "1 BOARD NEEDS YOU" : `${matches.length} BOARDS NEED YOU`}</small>
                <strong>{primary.unavailable ? "RECONNECT TO PLAY" : "YOUR TURN"}</strong>
                <em>
                    {matches.length === 1 ? opponent : `First: ${opponent}`} · {dueCopy(primary)}
                </em>
            </span>
            <span className="turn-spotlight-cta">
                PLAY NOW <b aria-hidden="true">›</b>
            </span>
        </button>
    );
}

function MatchCard({ match, onManage }: { match: CorrespondenceMatch; onManage: () => void }) {
    const yourMove = match.phase === "playing" && match.color === match.turn;
    const status = matchStatus(match, yourMove);
    return (
        <article
            className={`inbox-match${yourMove ? " your-move" : ""}${match.unavailable ? " unavailable" : ""}`}
            data-match-key={match.matchKey}
        >
            <button type="button" className="inbox-match-open" onClick={() => openMatch(match)}>
                <MiniBoard match={match} />
                <span className="inbox-match-copy">
                    <small>{status}</small>
                    <strong>{match.opponent?.username ?? "Waiting for a friend"}</strong>
                    <em>
                        {match.moveCount ? `${match.moveCount} moves · ` : ""}
                        {dueCopy(match)}
                    </em>
                </span>
                <span className="inbox-match-arrow" aria-hidden="true">
                    ›
                </span>
            </button>
            <button
                type="button"
                className="inbox-match-manage"
                aria-label={`Manage board with ${match.opponent?.username ?? "your friend"}`}
                onClick={() => cue(onManage)}
            >
                •••
            </button>
        </article>
    );
}

function BoardActions({ match, onClose }: { match: CorrespondenceMatch; onClose: () => void }) {
    const busy = useStore((state) => state.socialBusy);
    const [confirmEnd, setConfirmEnd] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const title = match.opponent?.username ?? "Friend board";

    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !busy) onClose();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [busy, onClose]);

    const remove = () => {
        if (match.incoming) void rivalsClient.cancelChallenge(match.matchKey);
        cue(() => correspondence.removeReference(match.matchKey));
        onClose();
    };

    const end = () => {
        setActionError(null);
        cue(() => setConfirmEnd(false));
        void endCorrespondenceMatch(match).then((ended) => {
            if (ended) {
                onClose();
            } else {
                setActionError("We couldn’t reach this game. Check your connection, or remove this card.");
            }
        });
    };

    const retry = () => {
        cue(onClose);
        store.patch({ socialBusy: true });
        void startCorrespondenceMatch({ matchKey: match.matchKey, pace: match.pace }).then(() => {
            store.patch({ socialBusy: false });
        });
    };

    return (
        <div
            className="board-actions-backdrop"
            role="presentation"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget && !busy) onClose();
            }}
        >
            <section
                className="board-actions-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="board-actions-title"
            >
                <button
                    type="button"
                    className="board-actions-close"
                    aria-label="Close board actions"
                    onClick={() => cue(onClose)}
                >
                    ×
                </button>
                <p>{confirmEnd ? "CONFIRM" : match.unavailable ? "RECONNECT BOARD" : "BOARD OPTIONS"}</p>
                <h2 id="board-actions-title">{confirmEnd ? "End this match?" : title}</h2>
                {confirmEnd ? (
                    <>
                        <span>
                            {match.phase === "waiting"
                                ? "This cancels the challenge for everyone."
                                : "This resigns the game and gives your rival the win."}
                        </span>
                        <div className="board-actions-row">
                            <button
                                type="button"
                                className="board-action neutral"
                                onClick={() => cue(() => setConfirmEnd(false))}
                            >
                                Keep playing
                            </button>
                            <button type="button" className="board-action danger" disabled={busy} onClick={end}>
                                {busy ? "Ending…" : "End match"}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <span>
                            {match.unavailable
                                ? "The last connection attempt failed. Your saved board is still here."
                                : `${paceLabel(match.pace)} · ${dueCopy(match)}`}
                        </span>
                        {actionError && (
                            <p className="board-action-error" role="alert">
                                {actionError}
                            </p>
                        )}
                        {match.phase !== "over" && !match.unavailable && (
                            <button
                                type="button"
                                className="board-action danger-outline"
                                disabled={busy}
                                onClick={() => cue(() => setConfirmEnd(true))}
                            >
                                End match
                                <small>{match.phase === "waiting" ? "Cancel for everyone" : "Resign this game"}</small>
                            </button>
                        )}
                        {match.phase === "waiting" && match.roomCode && !match.opponent && (
                            <button
                                type="button"
                                className="board-action share"
                                disabled={busy}
                                onClick={() => {
                                    cue(() => setActionError(null));
                                    void shareCorrespondenceInvite(match).then((shared) => {
                                        if (!shared)
                                            setActionError("Open this board inside RUN to share its invite link.");
                                    });
                                }}
                            >
                                Share invite link
                                <small>Open your phone’s share sheet</small>
                            </button>
                        )}
                        {match.unavailable && (
                            <button type="button" className="board-action neutral" disabled={busy} onClick={retry}>
                                Try reconnecting
                                <small>Open this saved board again</small>
                            </button>
                        )}
                        <button type="button" className="board-action neutral" disabled={busy} onClick={remove}>
                            Remove this card
                            <small>
                                {match.phase === "over" || match.unavailable
                                    ? "Clear it from Your Games"
                                    : "Match keeps running"}
                            </small>
                        </button>
                    </>
                )}
            </section>
        </div>
    );
}

function NavIcon({ name }: { name: "rivals" | "league" | "store" | "settings" }) {
    if (name === "settings") return <GearIcon />;
    if (name === "rivals") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="8" cy="8" r="3" />
                <circle cx="16" cy="8" r="3" />
                <path d="M2.5 19c.8-4 2.8-6 5.5-6s4.7 2 5.5 6M10.5 19c.8-4 2.8-6 5.5-6s4.7 2 5.5 6" />
            </svg>
        );
    }
    if (name === "league") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4h10v5c0 4-2 7-5 8-3-1-5-4-5-8ZM4 6h3v3c0 2-1 3-3 3ZM20 6h-3v3c0 2 1 3 3 3M9 21h6M12 17v4" />
            </svg>
        );
    }
    if (name === "store") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9h16l-1 11H5ZM7 9V7a5 5 0 0 1 10 0v2" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 14.2 8.2 20 9l-4.2 4 1 5.8L12 16l-4.8 2.8 1-5.8L4 9l5.8-.8Z" />
        </svg>
    );
}

export default function MainMenu() {
    const state = useStore((value) => value);
    const [managedMatchKey, setManagedMatchKey] = useState<string | null>(null);
    const [notificationBusy, setNotificationBusy] = useState(false);
    const matches = state.correspondenceMatches;
    const yourMove = matches
        .filter((match) => match.phase === "playing" && match.color === match.turn)
        .sort(
            (left, right) =>
                (left.deadlineAt ?? Number.POSITIVE_INFINITY) - (right.deadlineAt ?? Number.POSITIVE_INFINITY),
        );
    const waiting = matches.filter(
        (match) => match.phase === "waiting" || (match.phase === "playing" && match.color !== match.turn),
    );
    const recent = matches.filter((match) => match.phase === "over");
    const visible = [...yourMove, ...waiting, ...recent];
    const reward = dailySystems.rewardView();
    const busy = state.socialBusy;
    const onlineReady = canUseAuthoritativeRealtime();
    const managedMatch = matches.find((match) => match.matchKey === managedMatchKey) ?? null;

    const enableTurnAlerts = async () => {
        if (notificationBusy) return;
        await audioManager.unlock();
        setNotificationBusy(true);
        const result = await updateNotificationPreference(true);
        setNotificationBusy(false);
        if (result === "enabled") {
            audioManager.play("reward");
            void runtimeServices.haptic("success");
            store.patch({ toast: "Turn alerts enabled." });
            return;
        }
        audioManager.play("reject");
        void runtimeServices.haptic("error");
        store.patch({
            toast:
                result === "unavailable"
                    ? "Phone alerts are unavailable here. Check RUN notifications in iOS Settings."
                    : "RUN could not enable phone alerts. Check iOS Settings → Notifications → RUN.",
        });
    };

    useEffect(() => {
        void (store.get().onlineStatus !== "idle" ? leaveOnlineMatch() : Promise.resolve()).then(() =>
            rivalsClient.connect(),
        );
    }, []);

    const findRival = () => cue(() => store.patch({ menuScreen: "rivals", rivalDirectoryError: null }));

    const code = state.onlineJoinCode.trim().toUpperCase();
    const validCode = /^[A-Z0-9]{6}$/.test(code);
    const joinByCode = () => {
        if (!onlineReady) return;
        if (busy || !validCode) {
            store.patch({ onlineError: "Enter all 6 characters from your friend’s code." });
            audioManager.play("reject");
            void runtimeServices.haptic("error");
            return;
        }
        cue(() => store.patch({ socialBusy: true, onlineJoinCode: code }));
        audioManager.play("start");
        void startOnlineMatch({ mode: "join", joinCode: code }).then((ok) => {
            store.patch({ socialBusy: false });
            if (!ok) audioManager.play("reject");
        });
    };

    return (
        <main
            className={`dream-menu inbox-menu pt-safe-top pb-safe-bottom${yourMove.length ? " has-turns" : ""}`}
            data-testid="main-menu"
        >
            <header className="dream-topbar inbox-topbar">
                <div className="dream-wordmark">
                    <span>CHESS WITH FRIENDS</span>
                    <h1>{GAME_NAME}</h1>
                </div>
                <div className="lobby-meta">
                    <button
                        type="button"
                        className="lobby-wallet"
                        aria-label={`${formatNumber(state.auras)} auras. Open Store.`}
                        onClick={() => cue(() => store.patch({ menuScreen: "lounge" }))}
                    >
                        <span>
                            <AuraIcon />
                        </span>
                        <strong>{formatNumber(state.auras)}</strong>
                        <b aria-hidden="true">+</b>
                    </button>
                    <small className="inbox-version">v{packageJson.version}</small>
                </div>
            </header>

            <TurnSpotlight matches={yourMove} />

            <button
                type="button"
                className="cpu-hero"
                onClick={() => cue(() => store.patch({ menuScreen: "practice" }))}
            >
                <span className="cpu-hero-art" aria-hidden="true">
                    <img src={lucidmateRookbot} alt="" />
                </span>
                <div>
                    <p>PLAY THE COMPUTER</p>
                    <h2>Start a solo game</h2>
                    <small>Easy, Standard or Expert · choose your side</small>
                </div>
                <b aria-hidden="true">›</b>
            </button>

            <div className="inbox-start-panel">
                <section className="inbox-actions" aria-label="Start a game">
                    <button
                        type="button"
                        className="inbox-action primary"
                        onClick={() => cue(() => store.patch({ menuScreen: "challenge" }))}
                    >
                        <span className="inbox-action-glyph">＋</span>
                        <span>
                            <strong>Challenge a friend</strong>
                            <small>{onlineReady ? "Play over a day or three" : "See how friend games work"}</small>
                        </span>
                    </button>
                    <button type="button" className="inbox-action" onClick={findRival}>
                        <span className="inbox-action-glyph">⌁</span>
                        <span>
                            <strong>Find a rival</strong>
                            <small>
                                {onlineReady ? "Choose a player · they move first" : "Browse async opponents in RUN"}
                            </small>
                        </span>
                    </button>
                </section>
                <form
                    className={`join-code-strip${onlineReady ? "" : " unavailable"}`}
                    aria-label="Join a match with a code"
                    onSubmit={(event) => {
                        event.preventDefault();
                        joinByCode();
                    }}
                >
                    <span className="join-code-glyph">
                        <JoinIcon />
                    </span>
                    <label htmlFor="match-code">
                        <span>JOIN WITH CODE</span>
                        <input
                            id="match-code"
                            data-testid="join-code-input"
                            className="join-code-input"
                            value={state.onlineJoinCode}
                            placeholder={onlineReady ? "ENTER CODE" : "OPEN IN RUN TO JOIN"}
                            disabled={!onlineReady}
                            autoCapitalize="characters"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={6}
                            onChange={(event) =>
                                store.patch({
                                    onlineJoinCode: event.currentTarget.value
                                        .toUpperCase()
                                        .replace(/[^A-Z0-9]/g, "")
                                        .slice(0, 6),
                                    onlineError: null,
                                })
                            }
                        />
                    </label>
                    <button type="submit" className="join-code-submit" disabled={busy || !validCode || !onlineReady}>
                        JOIN
                    </button>
                </form>
                {state.onlineError && (
                    <p className="join-code-error" role="alert">
                        {state.onlineError}
                    </p>
                )}
            </div>

            <section className={`inbox-list${visible.length ? "" : " empty"}`} aria-label="Match inbox">
                <div className="inbox-section-head">
                    <p>YOUR GAMES</p>
                    <span>
                        {yourMove.length
                            ? `${yourMove.length} waiting on you`
                            : visible.length
                              ? `${visible.length} ${visible.length === 1 ? "board" : "boards"}`
                              : "ALL CAUGHT UP"}
                    </span>
                </div>
                {visible.length ? (
                    <div className="inbox-match-stack">
                        {state.notificationsEnabled && state.notificationsConsent !== "granted" && (
                            <button
                                type="button"
                                className="turn-alert-card"
                                disabled={notificationBusy}
                                onClick={() => void enableTurnAlerts()}
                            >
                                <span className="turn-alert-icon">
                                    <BellIcon />
                                </span>
                                <span>
                                    <strong>Finish turn-alert setup</strong>
                                    <small>Allow RUN to alert you when a friend moves.</small>
                                </span>
                                <b>{notificationBusy ? "…" : "ENABLE"}</b>
                            </button>
                        )}
                        {visible.map((match) => (
                            <MatchCard
                                key={match.matchKey}
                                match={match}
                                onManage={() => setManagedMatchKey(match.matchKey)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="inbox-empty">
                        <img className="inbox-empty-art" src={lucidmateFriendsBoard} alt="" aria-hidden="true" />
                        <div>
                            <strong>No friend games yet</strong>
                            <p>Challenge someone, or play the computer above.</p>
                        </div>
                    </div>
                )}
            </section>

            <button
                type="button"
                className={`inbox-daily${reward.ready && !reward.claimed ? " ready" : ""}`}
                onClick={() => cue(() => store.patch({ menuScreen: "dreams" }))}
            >
                <span className="daily-beacon-orbit" aria-hidden="true" />
                <span>
                    <small>DAILY DREAM</small>
                    <strong>
                        {reward.claimed
                            ? "Keep today's streak alive"
                            : `${formatNumber(reward.reward)} auras are ready`}
                    </strong>
                </span>
                <b aria-hidden="true">›</b>
            </button>

            <nav className="dream-dock inbox-dock" aria-label="Community menus">
                {(
                    [
                        ["rivals", "rivals", "Rivals"],
                        ["league", "league", "League"],
                        ["lounge", "store", "Store"],
                        ["settings", "settings", "Settings"],
                    ] as const
                ).map(([screen, icon, label]) => (
                    <button
                        key={screen}
                        type="button"
                        data-testid={`dock-${screen}`}
                        onClick={() => cue(() => store.patch({ menuScreen: screen }))}
                    >
                        <span>
                            <NavIcon name={icon} />
                        </span>
                        {label}
                    </button>
                ))}
            </nav>
            {managedMatch && <BoardActions match={managedMatch} onClose={() => setManagedMatchKey(null)} />}
        </main>
    );
}
