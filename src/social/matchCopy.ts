import type { Color, GameStatus, MatchEndReason, MatchSummary } from "../game/chess/types.ts";
import { CHESS_REACTIONS, type CorrespondenceMatch, paceLabel } from "./model.ts";

export type { MatchEndReason };

export type ResultKind = "checkmate" | "timeout" | "resign" | "draw" | "other";

export interface ResultPresentation {
    kind: ResultKind;
    stamp: string | null;
    eyebrow: string;
    title: string;
    explanation: string;
}

function squareName(square: number): string {
    return `${"abcdefgh"[square % 8] ?? "?"}${Math.floor(square / 8) + 1}`;
}

export function normalizeEndReason(reason: string | null | undefined, status?: GameStatus): MatchEndReason | null {
    if (reason === "timeout" || reason === "resign" || reason === "cancelled") return reason;
    if (reason === "checkmate" || reason === "stalemate" || reason === "draw") return reason;
    if (status === "checkmate" || status === "stalemate" || status === "draw") return status;
    return null;
}

export function inboxDueCopy(match: CorrespondenceMatch, now = Date.now()): string {
    if (match.unavailable) return "Tap to reconnect";
    if (match.phase === "waiting") return match.incoming ? "You play White" : paceLabel(match.pace);
    if (match.phase === "over") {
        if (match.reason === "cancelled") return "Match ended";
        if (match.reason === "timeout") {
            if (match.result === "win") return "Won on time";
            if (match.result === "loss") return "Lost on time";
            return "Time ran out";
        }
        if (match.reason === "resign") {
            if (match.result === "win") return "Rival resigned";
            if (match.result === "loss") return "You resigned";
        }
        if (match.result === "win") return "You won";
        if (match.result === "loss") return "Rival won";
        return "Draw";
    }
    if (!match.deadlineAt) return paceLabel(match.pace);
    const remaining = Math.max(0, match.deadlineAt - now);
    const hours = Math.max(1, Math.ceil(remaining / 3_600_000));
    return hours < 24 ? `${hours}h left` : `${Math.ceil(hours / 24)}d left`;
}

export function inboxStatus(match: CorrespondenceMatch, yourMove: boolean): string {
    if (match.unavailable) return "RECONNECT";
    if (match.phase === "waiting") return match.incoming ? "YOUR FIRST MOVE" : "CHALLENGE SENT";
    if (yourMove) return "YOUR MOVE";
    if (match.phase === "over") {
        if (match.reason === "timeout") {
            if (match.result === "win") return "WON ON TIME";
            if (match.result === "loss") return "LOST ON TIME";
            return "TIME OUT";
        }
        if (match.reason === "resign") return "RESIGNED";
        return "FINAL";
    }
    return "WAITING";
}

export function inboxActivity(match: CorrespondenceMatch): string | null {
    if (match.phase === "waiting" && !match.opponent) return null;
    if (match.reaction) {
        return CHESS_REACTIONS.find((entry) => entry.id === match.reaction?.id)?.label ?? "New reaction";
    }
    if (match.lastMove) return `Last move ${squareName(match.lastMove.from)}–${squareName(match.lastMove.to)}`;
    if (match.phase === "waiting") return match.incoming ? "A fresh challenge" : "Board ready";
    return null;
}

export function resultPresentation(summary: MatchSummary): ResultPresentation {
    const reason = normalizeEndReason(summary.reason, summary.status) ?? summary.status;
    if (reason === "timeout") {
        const lost = summary.result === "loss";
        return {
            kind: "timeout",
            stamp: "TIME OUT",
            eyebrow: "GAME OVER",
            title: lost ? "You ran out of time" : summary.result === "win" ? "They ran out of time" : "Time ran out",
            explanation: lost ? "The move clock ran out on your turn." : "The move clock ran out on their turn.",
        };
    }
    if (reason === "resign") {
        const lost = summary.result === "loss";
        return {
            kind: "resign",
            stamp: "RESIGNED",
            eyebrow: "GAME OVER",
            title: lost ? "You resigned" : summary.result === "win" ? "Rival resigned" : "Match ended",
            explanation: lost ? "You left the board." : "Your rival left the board.",
        };
    }
    if (reason === "checkmate" || summary.status === "checkmate") {
        return {
            kind: "checkmate",
            stamp: "CHECKMATE!",
            eyebrow: "GAME OVER",
            title: summary.result === "loss" ? "Rival wins" : "You win",
            explanation: "The king has no legal escape. The game is over.",
        };
    }
    if (reason === "stalemate" || summary.status === "stalemate") {
        return {
            kind: "draw",
            stamp: null,
            eyebrow: "STALEMATE",
            title: "Draw",
            explanation: "A perfectly balanced dream.",
        };
    }
    return {
        kind: "draw",
        stamp: null,
        eyebrow: summary.status.toUpperCase(),
        title: summary.result === "win" ? "You win" : summary.result === "loss" ? "You lose" : "Draw",
        explanation:
            summary.result === "win"
                ? "Brilliant board!"
                : summary.result === "draw"
                  ? "A perfectly balanced dream."
                  : "Good game. Your next idea is waiting.",
    };
}

export function turnHeadline(input: {
    turn: Color;
    playerColor: Color;
    opponentMode: "ai" | "local" | "online";
    matchStatus: GameStatus;
    endReason: string | null;
    thinking: boolean;
    waitingOnline: boolean;
    connectingOnline: boolean;
    friendMatch?: boolean;
}): { eyebrow: string; headline: string; tone: "own-turn" | "opponent-turn" | "local-turn" | "muted" | "alert" } {
    const color = input.turn === "w" ? "WHITE" : "BLACK";
    const reason = normalizeEndReason(input.endReason, input.matchStatus);
    if (reason === "timeout") return { eyebrow: "GAME OVER", headline: "TIME OUT", tone: "alert" };
    if (reason === "resign") return { eyebrow: "GAME OVER", headline: "RESIGNED", tone: "muted" };
    if (input.matchStatus === "checkmate") return { eyebrow: "GAME OVER", headline: "CHECKMATE", tone: "alert" };
    if (input.matchStatus === "stalemate") return { eyebrow: "GAME OVER", headline: "STALEMATE", tone: "muted" };
    if (input.matchStatus === "draw") return { eyebrow: "GAME OVER", headline: "DRAW", tone: "muted" };
    if (input.waitingOnline) {
        return {
            eyebrow: input.friendMatch ? "FRIEND MATCH" : "ONLINE MATCH",
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
