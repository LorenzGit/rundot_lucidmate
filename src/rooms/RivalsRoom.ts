import { GameRoom, type GameMessage, type LeaveReason, type Player } from "@series-inc/rundot-game-sdk/mp-server";
import { isMatchKey, type CorrespondencePace, type RivalIdentity } from "../social/model.ts";
import type { RivalDirectoryProfile, RivalInvitation, RivalsProtocol } from "../social/rivalsProtocol.ts";

const MAX_DIRECTORY_PLAYERS = 5_000;
const MAX_SEARCH_RESULTS = 12;
const MAX_INCOMING_INVITES = 12;
const INVITE_LIFETIME_MS = 30 * 86_400_000;

function safeProfile(value: unknown): RivalDirectoryProfile | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<RivalDirectoryProfile>;
    if (typeof candidate.id !== "string" || typeof candidate.username !== "string") return null;
    return {
        id: candidate.id.slice(0, 128),
        username: candidate.username.trim().slice(0, 40) || "Dreamer",
        avatarUrl: typeof candidate.avatarUrl === "string" ? candidate.avatarUrl.slice(0, 500) : null,
        lastSeenAt: typeof candidate.lastSeenAt === "number" ? candidate.lastSeenAt : 0,
    };
}

function safeInvite(value: unknown): RivalInvitation | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<RivalInvitation>;
    const from = safeProfile(candidate.from);
    if (!isMatchKey(candidate.matchKey) || (candidate.pace !== "daily" && candidate.pace !== "relaxed") || !from) {
        return null;
    }
    return {
        matchKey: candidate.matchKey,
        pace: candidate.pace,
        roomCode:
            typeof candidate.roomCode === "string" && /^[A-Z0-9]{6}$/.test(candidate.roomCode)
                ? candidate.roomCode
                : null,
        from,
        createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : 0,
    };
}

export default class RivalsRoom extends GameRoom<RivalsProtocol> {
    private profiles = new Map<string, RivalDirectoryProfile>();
    private invitations = new Map<string, { to: string; invitation: RivalInvitation }>();

    onPlayerJoin(player: Player): void {
        const profile: RivalDirectoryProfile = {
            id: player.id,
            username: player.username.trim().slice(0, 40) || "Dreamer",
            avatarUrl: typeof player.avatarUrl === "string" ? player.avatarUrl.slice(0, 500) : null,
            lastSeenAt: this.now(),
        };
        this.profiles.set(player.id, profile);
        this.trimDirectory();
        this.sendDirectory(player.id, "");
        this.save();
    }

    onPlayerLeave(_player: Player, _reason: LeaveReason): void {}

    onGameMessage(message: GameMessage<RivalsProtocol>): void {
        const { sender, payload } = message;
        if (!sender.connected) return;
        const profile = this.profiles.get(sender.id);
        if (profile) {
            profile.lastSeenAt = this.now();
            profile.username = sender.username.trim().slice(0, 40) || profile.username;
            profile.avatarUrl = typeof sender.avatarUrl === "string" ? sender.avatarUrl.slice(0, 500) : null;
        }

        switch (payload.type) {
            case "refresh":
                this.sendDirectory(sender.id, "");
                return;
            case "search":
                this.sendDirectory(sender.id, payload.query);
                return;
            case "challenge":
                this.handleChallenge(sender, payload);
                return;
            case "acceptChallenge":
                this.removeInvitation(sender.id, payload.matchKey, true);
                return;
            case "cancelChallenge":
                this.removeInvitation(sender.id, payload.matchKey, false, payload.requestId);
                return;
        }
    }

    protected getPersistState(): Record<string, unknown> {
        return {
            profiles: [...this.profiles.values()],
            invitations: [...this.invitations.entries()].map(([matchKey, value]) => ({ matchKey, ...value })),
        };
    }

    onRestore(snapshot: Record<string, unknown>): void {
        this.profiles.clear();
        if (Array.isArray(snapshot.profiles)) {
            for (const value of snapshot.profiles) {
                const profile = safeProfile(value);
                if (profile) this.profiles.set(profile.id, profile);
            }
        }
        this.invitations.clear();
        if (Array.isArray(snapshot.invitations)) {
            for (const value of snapshot.invitations) {
                if (!value || typeof value !== "object") continue;
                const candidate = value as { matchKey?: unknown; to?: unknown; invitation?: unknown };
                const invitation = safeInvite(candidate.invitation);
                if (invitation && typeof candidate.to === "string") {
                    this.invitations.set(invitation.matchKey, { to: candidate.to.slice(0, 128), invitation });
                }
            }
        }
        this.pruneInvitations();
        this.trimDirectory();
    }

    private sendDirectory(playerId: string, rawQuery: string): void {
        this.pruneInvitations();
        const query = rawQuery.trim().toLocaleLowerCase().slice(0, 40);
        const activeOpponents = new Set(
            [...this.invitations.values()]
                .filter((entry) => entry.to === playerId || entry.invitation.from.id === playerId)
                .map((entry) => (entry.to === playerId ? entry.invitation.from.id : entry.to)),
        );
        const candidates = [...this.profiles.values()]
            .filter((profile) => profile.id !== playerId && !activeOpponents.has(profile.id))
            .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        const searchResults =
            query.length >= 2
                ? candidates
                      .filter((profile) => profile.username.toLocaleLowerCase().includes(query))
                      .slice(0, MAX_SEARCH_RESULTS)
                : [];
        const invitations = [...this.invitations.values()]
            .filter((entry) => entry.to === playerId)
            .map((entry) => entry.invitation)
            .sort((a, b) => b.createdAt - a.createdAt);
        this.sendTo(playerId, {
            type: "directory",
            recommendations: candidates.slice(0, 5),
            searchResults,
            query,
            invitations,
        });
    }

    private handleChallenge(sender: Player, payload: Extract<RivalsProtocol, { type: "challenge" }>): void {
        const fail = (reason: string) =>
            this.sendTo(sender.id, { type: "error", requestId: payload.requestId.slice(0, 80), reason });
        if (payload.targetProfileId === sender.id) {
            fail("You can’t challenge yourself.");
            return;
        }
        const target = this.profiles.get(payload.targetProfileId);
        if (!target) {
            fail("That player hasn’t opened Lucidmate yet.");
            return;
        }
        if (!isMatchKey(payload.matchKey)) {
            fail("The new board could not be verified.");
            return;
        }
        if (payload.pace !== "daily" && payload.pace !== "relaxed") {
            fail("Choose a valid pace.");
            return;
        }
        const duplicate = [...this.invitations.values()].some(
            (entry) => entry.to === target.id && entry.invitation.from.id === sender.id,
        );
        if (duplicate) {
            fail(`You already have a challenge waiting for ${target.username}.`);
            return;
        }

        const senderProfile = this.profiles.get(sender.id) ?? this.identity(sender);
        const invitation: RivalInvitation = {
            matchKey: payload.matchKey,
            pace: payload.pace as CorrespondencePace,
            roomCode: null,
            from: senderProfile,
            createdAt: this.now(),
        };
        const incoming = [...this.invitations.values()]
            .filter((entry) => entry.to === target.id)
            .sort((a, b) => a.invitation.createdAt - b.invitation.createdAt);
        while (incoming.length >= MAX_INCOMING_INVITES) {
            const oldest = incoming.shift();
            if (oldest) this.invitations.delete(oldest.invitation.matchKey);
        }
        this.invitations.set(invitation.matchKey, { to: target.id, invitation });
        this.save();

        // The trusted room validated both identities and the durable invite.
        // This keeps arbitrary notification targets out of client control.
        void this.services.simulation
            .executeRecipe(sender.id, "lucidmate_send_challenge_notification", {
                targetId: target.id,
                matchKey: invitation.matchKey,
                pace: invitation.pace,
            })
            .catch((error: unknown) =>
                this.log.warn("challenge notification unavailable", {
                    target: target.id,
                    error: error instanceof Error ? error.message : String(error),
                }),
            );

        this.sendTo(sender.id, {
            type: "challengeSent",
            requestId: payload.requestId.slice(0, 80),
            target: target satisfies RivalIdentity,
        });
        if (this.players.has(target.id)) {
            this.sendTo(target.id, { type: "challengeReceived", invitation });
            this.sendDirectory(target.id, "");
        }
    }

    private removeInvitation(playerId: string, matchKey: string, accepting: boolean, requestId?: string): void {
        const entry = this.invitations.get(matchKey);
        if (!entry) {
            if (!accepting) {
                this.sendTo(playerId, {
                    type: "challengeRemoved",
                    matchKey,
                    reason: "cancelled",
                    ...(requestId ? { requestId } : {}),
                });
            }
            return;
        }
        if (accepting ? entry.to !== playerId : entry.to !== playerId && entry.invitation.from.id !== playerId) {
            this.sendTo(playerId, {
                type: "error",
                reason: "You can’t change this challenge.",
                ...(requestId ? { requestId } : {}),
            });
            return;
        }
        this.invitations.delete(matchKey);
        this.save();
        const reason = accepting ? "accepted" : "cancelled";
        this.sendTo(playerId, {
            type: "challengeRemoved",
            matchKey,
            reason,
            ...(requestId ? { requestId } : {}),
        });
        const other = entry.to === playerId ? entry.invitation.from.id : entry.to;
        if (this.players.has(other)) {
            this.sendTo(other, { type: "challengeRemoved", matchKey, reason });
            this.sendDirectory(other, "");
        }
        this.sendDirectory(playerId, "");
    }

    private pruneInvitations(): void {
        const cutoff = this.now() - INVITE_LIFETIME_MS;
        for (const [key, entry] of this.invitations) {
            if (entry.invitation.createdAt < cutoff) this.invitations.delete(key);
        }
    }

    private trimDirectory(): void {
        if (this.profiles.size <= MAX_DIRECTORY_PLAYERS) return;
        const keep = [...this.profiles.values()]
            .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
            .slice(0, MAX_DIRECTORY_PLAYERS);
        this.profiles = new Map(keep.map((profile) => [profile.id, profile]));
    }

    private identity(player: Player): RivalDirectoryProfile {
        return {
            id: player.id,
            username: player.username.trim().slice(0, 40) || "Dreamer",
            avatarUrl: typeof player.avatarUrl === "string" ? player.avatarUrl.slice(0, 500) : null,
            lastSeenAt: this.now(),
        };
    }

    private now(): number {
        const serverClock = (this as unknown as { getServerTime?: () => number }).getServerTime;
        return typeof serverClock === "function" ? serverClock.call(this) : Date.now();
    }
}
