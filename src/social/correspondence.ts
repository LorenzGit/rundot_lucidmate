import { onlineChess, type OnlineSessionSnapshot } from "../game/chess/onlineClient.ts";
import type { ChessServerMessage } from "../game/chess/protocol.ts";
import type { RivalInvitation } from "./rivalsProtocol.ts";
import { getRunPlayerProfile, resolveLaunchIntent } from "../sdk/runSdk.ts";
import { store } from "../state/store.ts";
import { analytics } from "../systems/analytics/analyticsConfig.ts";
import { saveSystem } from "../systems/save.ts";
import {
    type ChessReaction,
    type CorrespondenceMatch,
    type CorrespondencePace,
    createMatchReference,
    isMatchKey,
    type RivalIdentity,
    upsertMatch,
} from "./model.ts";

type ServerState = Extract<ChessServerMessage, { type: "state" }>;

function newMatchKey(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return `lm-${Date.now().toString(36)}-${[...bytes].map((byte) => byte.toString(36).padStart(2, "0")).join("")}`;
}

function updateMatch(match: CorrespondenceMatch): void {
    store.patch({ correspondenceMatches: upsertMatch(store.get().correspondenceMatches, match) });
    saveSystem.scheduleFlush();
}

function resultFor(state: ServerState, color: "w" | "b" | null): CorrespondenceMatch["result"] {
    if (state.phase !== "over") return null;
    if (!state.winner || !color) return "draw";
    return state.winner === color ? "win" : "loss";
}

export const correspondence = {
    refreshProfile(): void {
        const profile = getRunPlayerProfile();
        if (profile) store.patch({ profileName: profile.username });
    },

    createMatchKey(): string {
        return newMatchKey();
    },

    createReference(pace: CorrespondencePace): CorrespondenceMatch {
        const match = createMatchReference(newMatchKey(), pace);
        updateMatch(match);
        return match;
    },

    ensureReference(matchKey: string, pace: CorrespondencePace): CorrespondenceMatch {
        const existing = store.get().correspondenceMatches.find((match) => match.matchKey === matchKey);
        if (existing) return existing;
        const match = createMatchReference(matchKey, pace);
        updateMatch(match);
        return match;
    },

    receiveInvitation(invitation: RivalInvitation): CorrespondenceMatch {
        const previous = store.get().correspondenceMatches.find((match) => match.matchKey === invitation.matchKey);
        const next: CorrespondenceMatch = {
            ...(previous ?? createMatchReference(invitation.matchKey, invitation.pace)),
            pace: invitation.pace,
            phase: "waiting",
            color: null,
            opponent: invitation.from,
            roomCode: invitation.roomCode,
            updatedAt: invitation.createdAt,
            unavailable: false,
            incoming: true,
            challenger: false,
        };
        updateMatch(next);
        return next;
    },

    createOutgoingInvitation(matchKey: string, pace: CorrespondencePace, opponent: RivalIdentity): CorrespondenceMatch {
        const next: CorrespondenceMatch = {
            ...createMatchReference(matchKey, pace),
            opponent,
            updatedAt: Date.now(),
            incoming: false,
            challenger: true,
        };
        updateMatch(next);
        return next;
    },

    markInvitationAccepted(matchKey: string): void {
        const match = store.get().correspondenceMatches.find((entry) => entry.matchKey === matchKey);
        if (!match || !match.incoming) return;
        updateMatch({ ...match, incoming: false, challenger: false, updatedAt: Date.now() });
    },

    sync(state: ServerState, session: OnlineSessionSnapshot): CorrespondenceMatch | null {
        if (state.experience !== "async") return null;
        const matchKey = state.matchKey ?? session.matchKey ?? store.get().activeMatchKey;
        if (!matchKey || !isMatchKey(matchKey)) return null;
        const previous = store.get().correspondenceMatches.find((match) => match.matchKey === matchKey);
        const color = session.you;
        const opponentColor = color === "w" ? "b" : color === "b" ? "w" : null;
        const opponent = opponentColor ? state.players[opponentColor] : null;
        const next: CorrespondenceMatch = {
            ...(previous ?? createMatchReference(matchKey, state.pace ?? session.pace ?? "daily")),
            pace: state.pace ?? session.pace ?? previous?.pace ?? "daily",
            phase: state.phase,
            color,
            opponent,
            turn: state.turn,
            roomCode: state.roomCode ?? session.roomCode,
            deadlineAt: state.deadlineAt,
            updatedAt: state.updatedAt,
            moveCount: state.moveCount,
            lastMove: state.lastMove ? { from: state.lastMove.from, to: state.lastMove.to } : null,
            result: resultFor(state, color),
            reason: state.reason,
            reaction: state.reaction,
            rematchKey: state.rematch?.matchKey ?? previous?.rematchKey ?? null,
            unavailable: false,
            incoming: false,
            challenger: previous?.challenger ?? false,
        };
        if (previous?.phase === "waiting" && next.phase === "playing") {
            analytics.event("correspondence_match_started", { pace: next.pace });
        }
        if ((previous?.moveCount ?? 0) < 4 && next.moveCount >= 4) {
            analytics.event("correspondence_move_four", { pace: next.pace });
        }
        if (previous?.phase !== "over" && next.phase === "over") {
            analytics.event("correspondence_match_finished", {
                pace: next.pace,
                result: next.result ?? "draw",
            });
        }
        updateMatch(next);
        return next;
    },

    markCredited(matchKey: string): boolean {
        const match = store.get().correspondenceMatches.find((entry) => entry.matchKey === matchKey);
        if (!match || match.credited) return false;
        updateMatch({ ...match, credited: true });
        return true;
    },

    toggleMute(matchKey: string): void {
        const match = store.get().correspondenceMatches.find((entry) => entry.matchKey === matchKey);
        if (!match) return;
        updateMatch({ ...match, reactionsMuted: !match.reactionsMuted });
    },

    clearUnavailable(matchKey: string): void {
        const match = store.get().correspondenceMatches.find((entry) => entry.matchKey === matchKey);
        if (!match || !match.unavailable) return;
        updateMatch({ ...match, unavailable: false });
    },

    removeReference(matchKey: string): void {
        if (!store.get().correspondenceMatches.some((entry) => entry.matchKey === matchKey)) return;
        store.patch({
            correspondenceMatches: store.get().correspondenceMatches.filter((entry) => entry.matchKey !== matchKey),
        });
        saveSystem.scheduleFlush();
        analytics.event("correspondence_match_removed", {});
    },

    react(reaction: ChessReaction): boolean {
        const sent = onlineChess.react(reaction);
        if (sent) analytics.event("correspondence_reaction_sent", { reaction });
        return sent;
    },

    async resolveLaunchMatch(): Promise<{
        matchKey: string;
        pace: CorrespondencePace;
        roomCode: string | null;
    } | null> {
        const intent = await resolveLaunchIntent();
        if (!intent || (intent.kind !== "share" && intent.kind !== "notification" && intent.kind !== "deeplink")) {
            return null;
        }
        const matchKey = intent.params.matchKey;
        if (!isMatchKey(matchKey)) return null;
        const pace = intent.params.pace === "relaxed" ? "relaxed" : "daily";
        this.ensureReference(matchKey, pace);
        analytics.event("correspondence_link_opened", { kind: intent.kind, pace });
        const roomCodeParam = intent.params.roomCode;
        const roomCode =
            typeof roomCodeParam === "string" && /^[A-Z0-9]{6}$/.test(roomCodeParam) ? roomCodeParam : null;
        return { matchKey, pace, roomCode };
    },

    newRematchKey(pace: CorrespondencePace): string {
        const next = this.createReference(pace);
        return next.matchKey;
    },
};
