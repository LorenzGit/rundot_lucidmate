/**
 * In-match HUD: turn, helpers, promotion picker, results.
 */
import { useCallback, useEffect, useState } from "react";
import lucidmateReactionStickers from "../assets/art/lucidmate-reaction-stickers.png";
import lucidmateVictoryDuo from "../assets/art/lucidmate-victory-duo.png";
import { audioManager } from "../audio/audioManager.ts";
import { getRunController } from "../game/GameCanvas.tsx";
import type { OpponentMode } from "../game/chess/game.ts";
import type { Color, GameStatus, PieceType } from "../game/chess/types.ts";
import {
    HINT_COST,
    UNDO_COST,
    leaveOnlineMatch,
    shareCorrespondenceInvite,
    startCorrespondenceMatch,
    startCorrespondenceRematch,
    startMatch,
} from "../game/runController.ts";
import { correspondence } from "../social/correspondence.ts";
import { CHESS_REACTIONS, type CorrespondenceMatch, paceLabel } from "../social/model.ts";
import { store, useStore } from "../state/store.ts";
import { recordCompletedRun, rewardedAvailable, showRewarded } from "../systems/ads.ts";
import { t } from "../systems/localization.ts";
import { PLACEMENT } from "../systems/monetization/config.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import { saveSystem } from "../systems/save.ts";
import { formatNumber } from "../systems/numberFormat.ts";
import { dreamMastery } from "../systems/mastery.ts";
import { copyPlainText } from "../systems/shareText.ts";
import GearIcon from "./GearIcon.tsx";
import SettingToggle from "./SettingToggle.tsx";
import { resumeFromPause, usePauseGate } from "./usePauseGate.ts";

function ReactionIcon({ id }: { id: (typeof CHESS_REACTIONS)[number]["id"] }) {
    if (id === "nice_move") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5Z" />
            </svg>
        );
    }
    if (id === "didnt_see_it") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z" />
                <circle cx="12" cy="12" r="2.2" />
            </svg>
        );
    }
    if (id === "good_game") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 3 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7Z" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 8V4l-2 2a7 7 0 1 0 1.6 9M19 4h-4" />
        </svg>
    );
}

function ReactionSticker({ id }: { id: (typeof CHESS_REACTIONS)[number]["id"] }) {
    const index = Math.max(
        0,
        CHESS_REACTIONS.findIndex((reaction) => reaction.id === id),
    );
    return (
        <span
            className={`reaction-sticker sticker-${index}`}
            style={{ backgroundImage: `url(${lucidmateReactionStickers})` }}
            aria-hidden="true"
        />
    );
}

function IncomingReaction({ match }: { match: CorrespondenceMatch | null }) {
    const [visibleAt, setVisibleAt] = useState<number | null>(null);
    const reaction = match?.reaction ?? null;
    const isMine = Boolean(reaction && match?.reactionUsedAtMove === reaction.moveCount);
    useEffect(() => {
        if (!reaction || isMine) return;
        setVisibleAt(reaction.at);
        const timeout = window.setTimeout(() => setVisibleAt(null), 5_000);
        return () => window.clearTimeout(timeout);
    }, [reaction, isMine]);
    if (!reaction || isMine || visibleAt !== reaction.at) return null;
    const label = CHESS_REACTIONS.find((entry) => entry.id === reaction.id)?.label ?? "Friendly reaction";
    return (
        <div className="incoming-reaction pointer-events-auto" role="status" aria-live="polite">
            <ReactionSticker id={reaction.id} />
            <span>
                <small>{match?.opponent?.username ?? "Your rival"} reacted</small>
                <strong>{label}</strong>
            </span>
        </div>
    );
}

async function copyRoomCode(code: string): Promise<void> {
    const value = code.trim();
    if (!value) return;
    if (await copyPlainText(value)) {
        store.patch({ toast: `Copied ${value}` });
        audioManager.play("tap");
        void runtimeServices.haptic("success");
    } else {
        store.patch({ toast: "Could not copy code" });
        audioManager.play("reject");
        void runtimeServices.haptic("error");
    }
}

function tapFeedback(): void {
    audioManager.play("tap");
    void runtimeServices.haptic("light");
}

function turnPresentation(input: {
    turn: Color;
    playerColor: Color;
    opponentMode: OpponentMode;
    matchStatus: GameStatus;
    thinking: boolean;
    waitingOnline: boolean;
    connectingOnline: boolean;
}): { eyebrow: string; headline: string; tone: "own-turn" | "opponent-turn" | "local-turn" | "muted" | "alert" } {
    const color = input.turn === "w" ? "WHITE" : "BLACK";
    if (input.matchStatus === "checkmate") return { eyebrow: "GAME OVER", headline: "CHECKMATE", tone: "alert" };
    if (input.matchStatus === "stalemate") return { eyebrow: "GAME OVER", headline: "STALEMATE", tone: "muted" };
    if (input.matchStatus === "draw") return { eyebrow: "GAME OVER", headline: "DRAW", tone: "muted" };
    if (input.waitingOnline) {
        return {
            eyebrow: "ONLINE MATCH",
            headline: input.connectingOnline ? "CONNECTING…" : "WAITING…",
            tone: "muted",
        };
    }

    const eyebrow = `${input.matchStatus === "check" ? "IN CHECK · " : ""}${color} TO MOVE`;
    if (input.opponentMode === "local") {
        return {
            eyebrow: input.matchStatus === "check" ? "PASS & PLAY · IN CHECK" : "PASS & PLAY",
            headline: `${color} TO MOVE`,
            tone: input.matchStatus === "check" ? "alert" : "local-turn",
        };
    }
    if (input.turn === input.playerColor) {
        return { eyebrow, headline: "YOUR TURN", tone: input.matchStatus === "check" ? "alert" : "own-turn" };
    }
    return {
        eyebrow,
        headline: input.thinking && input.opponentMode === "ai" ? "AI THINKING" : "OPPONENT'S TURN",
        tone: input.matchStatus === "check" ? "alert" : "opponent-turn",
    };
}

export default function Hud() {
    const auras = useStore((s) => s.auras);
    const turn = useStore((s) => s.turn);
    const thinking = useStore((s) => s.thinking);
    const matchStatus = useStore((s) => s.matchStatus);
    const summary = useStore((s) => s.matchSummary);
    const pendingPromotion = useStore((s) => s.pendingPromotion);
    const canUndo = useStore((s) => s.canUndo);
    const freeHintReady = useStore((s) => s.freeHintReady);
    const freeUndoReady = useStore((s) => s.freeUndoReady);
    const opponentMode = useStore((s) => s.opponentMode);
    const onlineStatus = useStore((s) => s.onlineStatus);
    const onlineRoomCode = useStore((s) => s.onlineRoomCode);
    const onlineSeat = useStore((s) => s.onlineSeat);
    const onlinePlayerCount = useStore((s) => s.onlinePlayerCount);
    const onlineExperience = useStore((s) => s.onlineExperience);
    const socialBusy = useStore((s) => s.socialBusy);
    const activeMatchKey = useStore((s) => s.activeMatchKey);
    const correspondenceMatches = useStore((s) => s.correspondenceMatches);
    const playerColor = useStore((s) => s.playerColor);
    const showPause = usePauseGate();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const isOnline = opponentMode === "online";
    const isCorrespondence = isOnline && onlineExperience === "async";
    const activeMatch = activeMatchKey
        ? (correspondenceMatches.find((match) => match.matchKey === activeMatchKey) ?? null)
        : null;
    const waitingOnline = isOnline && (onlineStatus === "waiting" || onlineStatus === "connecting") && !summary;
    const reconnectingSavedBoard = isCorrespondence && Boolean(activeMatch) && onlineStatus === "connecting";
    const showOnlineWaitCard = waitingOnline && !reconnectingSavedBoard;
    const connectionFailed =
        isCorrespondence && (onlineStatus === "error" || onlineStatus === "disconnected") && !summary;
    const turnCopy = turnPresentation({
        turn,
        playerColor,
        opponentMode,
        matchStatus,
        thinking,
        waitingOnline,
        connectingOnline: onlineStatus === "connecting",
    });
    const isYourTurn =
        !summary &&
        !waitingOnline &&
        opponentMode !== "local" &&
        turn === playerColor &&
        (matchStatus === "playing" || matchStatus === "check");
    const canReact =
        isCorrespondence &&
        activeMatch?.phase === "playing" &&
        isYourTurn &&
        activeMatch.reactionUsedAtMove !== activeMatch.moveCount;

    const leave = useCallback(() => {
        tapFeedback();
        if (isOnline) void leaveOnlineMatch();
        store.patch({ phase: "menu", menuScreen: "main", matchSummary: null });
        void saveSystem.flush();
    }, [isOnline]);

    return (
        <div className="pointer-events-none absolute inset-0 pt-safe-top">
            <div className="game-hud">
                <div className={`hud-score ${turnCopy.tone}`} role="status" aria-live="polite">
                    <span>{turnCopy.eyebrow}</span>
                    <strong>{turnCopy.headline}</strong>
                </div>
                <div className="helper-auras hud-auras-top" role="status" aria-label={t("LabelAuras")}>
                    <span className="aura-glyph" aria-hidden="true" />
                    <strong>{formatNumber(auras)}</strong>
                </div>
                <button
                    type="button"
                    className="hud-settings pointer-events-auto"
                    aria-label={t("MenuSettings")}
                    onClick={() => {
                        tapFeedback();
                        setSettingsOpen(true);
                    }}
                >
                    <GearIcon />
                </button>
                <button type="button" className="hud-menu pointer-events-auto" onClick={leave}>
                    {t("ButtonMenu")}
                </button>
            </div>

            {isOnline && onlineRoomCode && !summary && !waitingOnline && (
                <div className="online-banner pointer-events-auto" role="status">
                    <span className="online-banner-label">
                        {isCorrespondence ? (activeMatch?.opponent?.username ?? "Friend match") : "Room"}
                    </span>
                    {isCorrespondence ? (
                        <strong className="online-banner-pace">
                            {activeMatch ? paceLabel(activeMatch.pace) : "Correspondence"}
                        </strong>
                    ) : (
                        <button
                            type="button"
                            className="online-code-btn online-banner-code"
                            title="Tap to copy room code"
                            aria-label={`Room code ${onlineRoomCode}. Tap to copy.`}
                            onClick={() => void copyRoomCode(onlineRoomCode)}
                        >
                            {onlineRoomCode}
                        </button>
                    )}
                    {onlineSeat && (
                        <span className="online-banner-seat">You: {onlineSeat === "w" ? "White" : "Black"}</span>
                    )}
                    <span className="online-banner-count">
                        {isCorrespondence ? (activeMatch?.color === turn ? "MOVE" : "WAIT") : `${onlinePlayerCount}/2`}
                    </span>
                    {isCorrespondence && activeMatch?.lastMove && (
                        <span className="online-banner-last">Move saved</span>
                    )}
                </div>
            )}

            {isCorrespondence && <IncomingReaction match={activeMatch} />}

            {showOnlineWaitCard && (
                <div className="online-wait-card pointer-events-auto" role="status">
                    <p className="eyebrow">ONLINE MATCH</p>
                    <h2>{onlineStatus === "connecting" ? "Connecting…" : "Waiting for opponent"}</h2>
                    {onlineRoomCode && (
                        <button
                            type="button"
                            className="online-code-btn online-wait-code"
                            title="Tap to copy room code"
                            aria-label={`Room code ${onlineRoomCode}. Tap to copy.`}
                            onClick={() => void copyRoomCode(onlineRoomCode)}
                        >
                            <span>Code</span>
                            <strong>{onlineRoomCode}</strong>
                            <span className="online-code-hint">Tap to copy</span>
                        </button>
                    )}
                    <p className="online-wait-hint">
                        {isCorrespondence
                            ? onlineRoomCode
                                ? "Your board is saved. Send the invite link, then come back when your friend moves."
                                : "No room code is available. Return to the menu and create a new board."
                            : "Share the code with a friend, or keep this open for a quick match."}
                    </p>
                    {isCorrespondence &&
                        onlineStatus !== "connecting" &&
                        activeMatch?.roomCode &&
                        !activeMatch.opponent && (
                            <button
                                type="button"
                                className="online-share-invite"
                                disabled={socialBusy}
                                onClick={() => {
                                    tapFeedback();
                                    void shareCorrespondenceInvite(activeMatch);
                                }}
                            >
                                Share invite link
                            </button>
                        )}
                    <button type="button" className="secondary-button" onClick={leave}>
                        Cancel
                    </button>
                </div>
            )}

            {connectionFailed && activeMatch && (
                <section className="connection-card pointer-events-auto" role="alert">
                    <p className="eyebrow">CONNECTION PAUSED</p>
                    <h2>Your board is safe</h2>
                    <p>We lost the live connection. Reopen the same saved board to continue.</p>
                    <button
                        type="button"
                        className="play-button"
                        onClick={() => {
                            tapFeedback();
                            void startCorrespondenceMatch({
                                matchKey: activeMatch.matchKey,
                                pace: activeMatch.pace,
                            });
                        }}
                    >
                        Reconnect
                    </button>
                    <button type="button" className="secondary-button" onClick={leave}>
                        Back to Your Games
                    </button>
                </section>
            )}

            {!summary && !waitingOnline && !connectionFailed && !isOnline && (
                <div className={`helper-bar${isYourTurn ? " your-turn" : ""}`}>
                    <HelperButton
                        label={t("HelperUndo")}
                        cost={freeUndoReady ? 0 : UNDO_COST}
                        auras={auras}
                        disabled={!canUndo || isOnline}
                        hint={isOnline ? "Undo is offline-only" : t("HelperUndoHint")}
                        onPress={() => {
                            audioManager.play("tap");
                            getRunController()?.undo();
                        }}
                    />
                    <HelperButton
                        label={t("HelperHint")}
                        cost={freeHintReady ? 0 : HINT_COST}
                        auras={auras}
                        disabled={thinking || Boolean(summary) || isOnline}
                        hint={isOnline ? "Hints are disabled in multiplayer" : t("HelperHintHint")}
                        onPress={() => {
                            audioManager.play("tap");
                            getRunController()?.hint();
                        }}
                    />
                    <div className="helper-auras" role="status" aria-label={t("LabelAuras")}>
                        <span className="aura-glyph" aria-hidden="true" />
                        <strong>{formatNumber(auras)}</strong>
                    </div>
                </div>
            )}

            {!summary && !waitingOnline && !connectionFailed && canReact && (
                <section className="reaction-bar pointer-events-auto your-turn" aria-label="Send a friendly reaction">
                    <header className="reaction-bar-head">
                        <strong>REACTIONS</strong>
                        <small>Send a friendly chess phrase</small>
                    </header>
                    <div className="reaction-actions">
                        {CHESS_REACTIONS.map((reaction) => (
                            <button
                                key={reaction.id}
                                type="button"
                                title={reaction.label}
                                aria-label={reaction.label}
                                onClick={() => {
                                    tapFeedback();
                                    if (!correspondence.react(reaction.id))
                                        store.patch({ toast: "Reaction could not be sent." });
                                }}
                            >
                                <b>
                                    <ReactionSticker id={reaction.id} />
                                    <ReactionIcon id={reaction.id} />
                                </b>
                                <small>{reaction.label}</small>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {pendingPromotion && <PromotionCard />}
            {summary && <ResultsCard />}
            {showPause && <PauseCard />}
            {settingsOpen && <InGameSettings onClose={() => setSettingsOpen(false)} />}
        </div>
    );
}

function HelperButton({
    label,
    cost,
    auras,
    disabled,
    hint,
    onPress,
}: {
    label: string;
    cost: number;
    auras: number;
    disabled?: boolean;
    hint: string;
    onPress: () => void;
}) {
    const affordable = cost === 0 || auras >= cost;
    return (
        <button
            type="button"
            className={`helper-btn pointer-events-auto${affordable && !disabled ? "" : " dim"}`}
            disabled={disabled || !affordable}
            title={hint}
            onClick={onPress}
        >
            <span className="helper-label">{label}</span>
            <span className="helper-cost">{cost === 0 ? "Free" : cost}</span>
        </button>
    );
}

function PromotionCard() {
    const choices: PieceType[] = ["q", "r", "b", "n"];
    const labels: Record<PieceType, string> = {
        q: "Queen",
        r: "Rook",
        b: "Bishop",
        n: "Knight",
        p: "P",
        k: "K",
    };
    return (
        <div className="modal-card pointer-events-auto">
            <p className="eyebrow">Promotion</p>
            <h2>Choose a piece</h2>
            <div className="promo-row">
                {choices.map((type) => (
                    <button
                        key={type}
                        type="button"
                        className="play-button promo-btn"
                        onClick={() => {
                            audioManager.play("tap");
                            getRunController()?.promote(type);
                        }}
                    >
                        {labels[type]}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ResultsCard() {
    const summary = useStore((s) => s.matchSummary);
    const auraDoubled = useStore((s) => s.auraDoubled);
    const opponentMode = useStore((s) => s.opponentMode);
    const masteryBonusAuras = useStore((s) => s.masteryBonusAuras);
    const onlineExperience = useStore((s) => s.onlineExperience);
    const [busy, setBusy] = useState(false);
    const matchesPlayed = useStore((state) => state.matchesPlayed);
    const wins = useStore((state) => state.wins);
    const capturesLifetime = useStore((state) => state.capturesLifetime);
    const bestWinStreak = useStore((state) => state.bestWinStreak);
    const mastery = dreamMastery({ matchesPlayed, wins, capturesLifetime, bestWinStreak });
    if (!summary) return null;

    const title = summary.result === "win" ? "You win" : summary.result === "loss" ? "You lose" : "Draw";
    const isCheckmate = summary.status === "checkmate";
    const outcomeTitle = isCheckmate && summary.result === "loss" ? "Rival wins" : title;
    const doubleOffered = !auraDoubled && summary.aurasEarned > 0 && rewardedAvailable(PLACEMENT.doubleAuras);
    const isOnline = opponentMode === "online";
    const isCorrespondence = isOnline && onlineExperience === "async";

    return (
        <>
            <div className={`match-result-backdrop${isCheckmate ? " checkmate" : ""}`} aria-hidden="true" />
            <div
                className={`modal-card pointer-events-auto results-card${isCheckmate ? " checkmate-card" : ""}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="match-result-title"
                aria-describedby={isCheckmate ? "checkmate-explanation" : undefined}
                data-testid={isCheckmate ? "checkmate-result" : "match-result"}
            >
                <div className={`results-celebration ${summary.result}${isCheckmate ? " checkmate" : ""}`}>
                    {isCheckmate && (
                        <div className="checkmate-verdict">
                            <span>GAME OVER</span>
                            <strong>CHECKMATE!</strong>
                            <small id="checkmate-explanation">The king has no legal escape. The game is over.</small>
                        </div>
                    )}
                    <img src={lucidmateVictoryDuo} alt="" aria-hidden="true" />
                    <div className="results-outcome">
                        {!isCheckmate && <p className="eyebrow">{summary.status}</p>}
                        <h2 id="match-result-title">{outcomeTitle}</h2>
                        <span>
                            {isCheckmate
                                ? summary.result === "win"
                                    ? "You trapped their king. Victory is yours!"
                                    : "Your rival trapped the king. Good game!"
                                : summary.result === "win"
                                  ? "Brilliant board!"
                                  : summary.result === "draw"
                                    ? "A perfectly balanced dream."
                                    : "Good game—your next idea is waiting."}
                        </span>
                    </div>
                </div>
                <div className="results-details">
                    <dl className="results-grid">
                        <div>
                            <dt>{t("LabelMoves")}</dt>
                            <dd>{summary.movesPlayed}</dd>
                        </div>
                        <div>
                            <dt>{t("LabelCaptures")}</dt>
                            <dd>{summary.captures}</dd>
                        </div>
                        <div>
                            <dt>{t("LabelChecks")}</dt>
                            <dd>{summary.checksGiven}</dd>
                        </div>
                        <div>
                            <dt>{t("LabelAuras")}</dt>
                            <dd>+{auraDoubled ? summary.aurasEarned * 2 : summary.aurasEarned}</dd>
                        </div>
                        {masteryBonusAuras > 0 && (
                            <div className="rank-reward">
                                <dt>DREAM RANK</dt>
                                <dd>+{formatNumber(masteryBonusAuras)}</dd>
                            </div>
                        )}
                    </dl>
                    <div className="results-dream-progress">
                        <span>
                            <small>DREAM PATH</small>
                            <strong>{mastery.rankName}</strong>
                        </span>
                        <progress value={mastery.progress} max={1} />
                        <em>
                            {mastery.nextRankName
                                ? `${formatNumber(mastery.remaining)} to ${mastery.nextRankName}`
                                : "Path complete"}
                        </em>
                    </div>

                    <div className="results-actions">
                        {doubleOffered && (
                            <button
                                type="button"
                                className="secondary-button results-double"
                                disabled={busy}
                                onClick={() => {
                                    setBusy(true);
                                    void showRewarded(PLACEMENT.doubleAuras).then((result) => {
                                        setBusy(false);
                                        if (result !== "verified") {
                                            store.patch({ toast: t("AdUnavailable") });
                                            void runtimeServices.haptic("error");
                                            return;
                                        }
                                        const state = store.get();
                                        store.patch({
                                            auraDoubled: true,
                                            auras: state.auras + summary.aurasEarned,
                                        });
                                        void saveSystem.flush();
                                        audioManager.play("reward");
                                        void runtimeServices.haptic("success");
                                    });
                                }}
                            >
                                {busy ? t("AdLoading") : t("ResultsDoubleAuras", { auras: summary.aurasEarned })}
                            </button>
                        )}

                        {!isOnline && (
                            <button
                                type="button"
                                className="play-button results-primary"
                                onClick={() => {
                                    audioManager.play("start");
                                    void runtimeServices.haptic("medium");
                                    recordCompletedRun();
                                    const state = store.get();
                                    store.patch({ matchSummary: null });
                                    startMatch({
                                        opponent: state.opponentMode,
                                        difficulty: state.difficulty,
                                        playerColor: state.playerColor,
                                    });
                                }}
                            >
                                {t("ResultsAgain")}
                            </button>
                        )}
                        {isCorrespondence && (
                            <button
                                type="button"
                                className="play-button results-primary"
                                disabled={busy}
                                onClick={() => {
                                    setBusy(true);
                                    audioManager.play("start");
                                    void runtimeServices.haptic("medium");
                                    void startCorrespondenceRematch().then((ok) => {
                                        setBusy(false);
                                        if (!ok) store.patch({ toast: "Could not open the rematch." });
                                    });
                                }}
                            >
                                {busy ? "OPENING REMATCH…" : "REMATCH"}
                            </button>
                        )}
                        <button
                            type="button"
                            className="secondary-button results-exit"
                            onClick={() => {
                                tapFeedback();
                                recordCompletedRun();
                                if (isOnline) void leaveOnlineMatch();
                                store.patch({ phase: "menu", menuScreen: "main", matchSummary: null });
                                void saveSystem.flush();
                            }}
                        >
                            {isCorrespondence ? "BACK TO YOUR GAMES" : t("ResultsLounge")}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

function PauseCard() {
    return (
        <div className="modal-card pointer-events-auto">
            <p className="eyebrow">{t("PausedEyebrow")}</p>
            <h2>{t("Paused")}</h2>
            <button
                type="button"
                className="play-button"
                onClick={() => {
                    tapFeedback();
                    resumeFromPause();
                }}
            >
                {t("PausedResume")}
            </button>
        </div>
    );
}

function InGameSettings({ onClose }: { onClose: () => void }) {
    const musicEnabled = useStore((s) => s.musicEnabled);
    const sfxEnabled = useStore((s) => s.sfxEnabled);
    const hapticsEnabled = useStore((s) => s.hapticsEnabled);
    const reducedMotion = useStore((s) => s.reducedMotion);

    return (
        <div className="modal-card pointer-events-auto settings-sheet">
            <p className="eyebrow">{t("MenuSettings")}</p>
            <SettingToggle
                label="Music"
                checked={musicEnabled}
                onChange={(on) => {
                    void runtimeServices.haptic("light");
                    store.patch({ musicEnabled: on });
                    void saveSystem.flush();
                }}
            />
            <SettingToggle
                label="SFX"
                checked={sfxEnabled}
                onChange={(on) => {
                    void runtimeServices.haptic("light");
                    store.patch({ sfxEnabled: on });
                    void saveSystem.flush();
                }}
            />
            <SettingToggle
                label="Haptics"
                checked={hapticsEnabled}
                onChange={(on) => {
                    void runtimeServices.haptic("light");
                    store.patch({ hapticsEnabled: on });
                    void saveSystem.flush();
                }}
            />
            <SettingToggle
                label="Reduced motion"
                checked={reducedMotion}
                onChange={(on) => {
                    void runtimeServices.haptic("light");
                    store.patch({ reducedMotion: on });
                    document.documentElement.dataset.reducedMotion = String(on);
                    void saveSystem.flush();
                }}
            />
            <button
                type="button"
                className="secondary-button"
                onClick={() => {
                    tapFeedback();
                    onClose();
                }}
            >
                {t("ButtonDone")}
            </button>
        </div>
    );
}
