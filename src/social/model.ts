import type { Color } from "../game/chess/types.ts";

export type CorrespondencePace = "daily" | "relaxed";
export type CorrespondencePhase = "waiting" | "playing" | "over";
export type CorrespondenceResult = "win" | "loss" | "draw";
export type ChessReaction = "nice_move" | "didnt_see_it" | "good_game" | "rematch";

export const CHESS_REACTIONS: ReadonlyArray<{ id: ChessReaction; label: string }> = [
    { id: "nice_move", label: "Nice move" },
    { id: "didnt_see_it", label: "Surprised" },
    { id: "good_game", label: "Good game" },
    { id: "rematch", label: "Rematch?" },
];

export interface RivalIdentity {
    id: string;
    username: string;
    avatarUrl: string | null;
}

export interface CorrespondenceReaction {
    id: ChessReaction;
    from: string;
    at: number;
}

export interface CorrespondenceMatch {
    matchKey: string;
    pace: CorrespondencePace;
    phase: CorrespondencePhase;
    color: Color | null;
    opponent: RivalIdentity | null;
    turn: Color;
    roomCode: string | null;
    deadlineAt: number | null;
    updatedAt: number;
    moveCount: number;
    lastMove: { from: number; to: number } | null;
    result: CorrespondenceResult | null;
    reason: string | null;
    reaction: CorrespondenceReaction | null;
    rematchKey: string | null;
    credited: boolean;
    reactionsMuted: boolean;
    unavailable: boolean;
}

export interface RivalSummary extends RivalIdentity {
    games: number;
    wins: number;
    losses: number;
    draws: number;
    active: number;
    lastPlayedAt: number;
}

export const MAX_CORRESPONDENCE_MATCHES = 48;
const MATCH_KEY_PATTERN = /^lm-[a-z0-9-]{12,72}$/;

export function isMatchKey(value: unknown): value is string {
    return typeof value === "string" && MATCH_KEY_PATTERN.test(value);
}

export function isChessReaction(value: unknown): value is ChessReaction {
    return CHESS_REACTIONS.some((reaction) => reaction.id === value);
}

export function paceLabel(pace: CorrespondencePace): string {
    return pace === "daily" ? "24 hours per move" : "3 days per move";
}

export function createMatchReference(matchKey: string, pace: CorrespondencePace): CorrespondenceMatch {
    return {
        matchKey,
        pace,
        phase: "waiting",
        color: null,
        opponent: null,
        turn: "w",
        roomCode: null,
        deadlineAt: null,
        updatedAt: Date.now(),
        moveCount: 0,
        lastMove: null,
        result: null,
        reason: null,
        reaction: null,
        rematchKey: null,
        credited: false,
        reactionsMuted: false,
        unavailable: false,
    };
}

export function upsertMatch(matches: readonly CorrespondenceMatch[], next: CorrespondenceMatch): CorrespondenceMatch[] {
    return [next, ...matches.filter((match) => match.matchKey !== next.matchKey)]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_CORRESPONDENCE_MATCHES);
}

export function rivalSummaries(matches: readonly CorrespondenceMatch[]): RivalSummary[] {
    const rivals = new Map<string, RivalSummary>();
    for (const match of matches) {
        const opponent = match.opponent;
        if (!opponent) continue;
        const rival = rivals.get(opponent.id) ?? {
            ...opponent,
            games: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            active: 0,
            lastPlayedAt: 0,
        };
        rival.lastPlayedAt = Math.max(rival.lastPlayedAt, match.updatedAt);
        if (match.phase === "over") {
            rival.games += 1;
            if (match.result === "win") rival.wins += 1;
            else if (match.result === "loss") rival.losses += 1;
            else if (match.result === "draw") rival.draws += 1;
        } else {
            rival.active += 1;
        }
        rivals.set(opponent.id, rival);
    }
    return [...rivals.values()].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

function integer(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function square(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 64 ? value : null;
}

function identity(value: unknown): RivalIdentity | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<RivalIdentity>;
    if (typeof candidate.id !== "string" || typeof candidate.username !== "string") return null;
    return {
        id: candidate.id.slice(0, 128),
        username: candidate.username.trim().slice(0, 40) || "Dreamer",
        avatarUrl: typeof candidate.avatarUrl === "string" ? candidate.avatarUrl.slice(0, 500) : null,
    };
}

function reaction(value: unknown): CorrespondenceReaction | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<CorrespondenceReaction>;
    if (!isChessReaction(candidate.id) || typeof candidate.from !== "string") return null;
    return { id: candidate.id, from: candidate.from.slice(0, 128), at: integer(candidate.at) };
}

export function sanitizeMatches(value: unknown): CorrespondenceMatch[] {
    if (!Array.isArray(value)) return [];
    const matches: CorrespondenceMatch[] = [];
    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const match = raw as Partial<CorrespondenceMatch>;
        if (!isMatchKey(match.matchKey)) continue;
        const color = match.color === "w" || match.color === "b" ? match.color : null;
        const winnerResult = match.result === "win" || match.result === "loss" || match.result === "draw";
        matches.push({
            matchKey: match.matchKey,
            pace: match.pace === "relaxed" ? "relaxed" : "daily",
            phase: match.phase === "playing" || match.phase === "over" ? match.phase : "waiting",
            color,
            opponent: identity(match.opponent),
            turn: match.turn === "b" ? "b" : "w",
            roomCode: typeof match.roomCode === "string" ? match.roomCode.slice(0, 12) : null,
            deadlineAt: match.deadlineAt == null ? null : integer(match.deadlineAt),
            updatedAt: integer(match.updatedAt),
            moveCount: integer(match.moveCount),
            lastMove: (() => {
                const from = square(match.lastMove?.from);
                const to = square(match.lastMove?.to);
                return from == null || to == null ? null : { from, to };
            })(),
            result: winnerResult ? (match.result as CorrespondenceResult) : null,
            reason: typeof match.reason === "string" ? match.reason.slice(0, 40) : null,
            reaction: reaction(match.reaction),
            rematchKey: isMatchKey(match.rematchKey) ? match.rematchKey : null,
            credited: match.credited === true,
            reactionsMuted: match.reactionsMuted === true,
            unavailable: match.unavailable === true,
        });
    }
    const unique = new Map(matches.map((match) => [match.matchKey, match]));
    return [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CORRESPONDENCE_MATCHES);
}
