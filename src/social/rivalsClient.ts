import type { ServerRoom } from "@series-inc/rundot-game-sdk";
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";
import { canUseAuthoritativeRealtime } from "../game/chess/onlineClient.ts";
import { correspondence } from "./correspondence.ts";
import type { CorrespondencePace, RivalIdentity } from "./model.ts";
import { RIVALS_DIRECTORY_KEY, RIVALS_ROOM_TYPE, type RivalInvitation, type RivalsProtocol } from "./rivalsProtocol.ts";
import { store } from "../state/store.ts";
import { saveSystem } from "../systems/save.ts";

type ChallengeResult = { ok: true; target: RivalIdentity } | { ok: false; error: string };

export class RivalsClient {
    private room: ServerRoom<RivalsProtocol> | null = null;
    private connectPromise: Promise<boolean> | null = null;
    private connectionGeneration = 0;
    private challengeRequests = new Map<
        string,
        { resolve: (result: ChallengeResult) => void; timeout: ReturnType<typeof setTimeout> }
    >();
    private acceptRequests = new Map<
        string,
        { resolve: (accepted: boolean) => void; timeout: ReturnType<typeof setTimeout> }
    >();

    async connect(): Promise<boolean> {
        if (this.room?.connectionState === "connected") return true;
        if (this.connectPromise) return this.connectPromise;
        const promise = this.open(this.connectionGeneration);
        this.connectPromise = promise;
        try {
            return await promise;
        } finally {
            if (this.connectPromise === promise) this.connectPromise = null;
        }
    }

    async disconnect(): Promise<void> {
        this.connectionGeneration += 1;
        const room = this.room;
        this.room = null;
        this.connectPromise = null;
        try {
            room?.leave();
        } catch {
            /* ignore */
        }
        store.patch({ rivalDirectoryStatus: "idle" });
    }

    private async open(generation: number): Promise<boolean> {
        if (!canUseAuthoritativeRealtime()) {
            store.patch({ rivalDirectoryStatus: "idle", rivalDirectoryError: null });
            return false;
        }
        store.patch({ rivalDirectoryStatus: "connecting", rivalDirectoryError: null });
        try {
            const room = await RundotGameAPI.realtime.joinOrCreateRoom<RivalsProtocol>(RIVALS_ROOM_TYPE, {
                persistentKey: RIVALS_DIRECTORY_KEY,
            });
            if (generation !== this.connectionGeneration) {
                room.leave();
                return false;
            }
            this.room = room;
            room.on({
                onMessage: (message) => {
                    if (this.room === room) this.handle(message);
                },
                onPrivateMessage: (message) => {
                    if (this.room === room) this.handle(message);
                },
                onError: (error) => {
                    if (this.room !== room) return;
                    store.patch({ rivalDirectoryStatus: "error", rivalDirectoryError: error || "Rivals unavailable." });
                },
                onDisconnect: () => {
                    if (this.room !== room) return;
                    store.patch({ rivalDirectoryStatus: "error", rivalDirectoryError: "Rivals connection paused." });
                },
                onReconnecting: () => {
                    if (this.room === room) store.patch({ rivalDirectoryStatus: "connecting" });
                },
                onReconnected: () => {
                    if (this.room !== room) return;
                    store.patch({ rivalDirectoryStatus: "ready", rivalDirectoryError: null });
                    room.send({ type: "refresh" });
                },
            });
            store.patch({ rivalDirectoryStatus: "ready", rivalDirectoryError: null });
            room.send({ type: "refresh" });
            return true;
        } catch (error) {
            if (generation !== this.connectionGeneration) return false;
            this.room = null;
            store.patch({
                rivalDirectoryStatus: "error",
                rivalDirectoryError: error instanceof Error ? error.message : "Rivals unavailable.",
            });
            return false;
        }
    }

    refresh(): void {
        void this.connect().then((ready) => {
            if (ready) this.room?.send({ type: "refresh" });
        });
    }

    search(query: string): void {
        const normalized = query.slice(0, 40);
        store.patch({ rivalSearchQuery: normalized });
        void this.connect().then((ready) => {
            if (ready) this.room?.send({ type: "search", query: normalized });
        });
    }

    async challenge(input: {
        targetProfileId: string;
        matchKey: string;
        pace: CorrespondencePace;
    }): Promise<ChallengeResult> {
        if (!(await this.connect()) || !this.room) return { ok: false, error: "Rivals are not connected." };
        const random = new Uint8Array(4);
        crypto.getRandomValues(random);
        const requestId = `challenge-${Date.now().toString(36)}-${[...random]
            .map((byte) => byte.toString(36).padStart(2, "0"))
            .join("")}`;
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.challengeRequests.delete(requestId);
                resolve({ ok: false, error: "The challenge took too long. Try again." });
            }, 8_000);
            this.challengeRequests.set(requestId, { resolve, timeout });
            this.room?.send({ type: "challenge", requestId, ...input });
        });
    }

    async accept(matchKey: string): Promise<boolean> {
        if (!(await this.connect()) || !this.room) return false;
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.acceptRequests.delete(matchKey);
                store.patch({ rivalDirectoryError: "The challenge could not be accepted. Try again." });
                resolve(false);
            }, 8_000);
            this.acceptRequests.set(matchKey, { resolve, timeout });
            this.room?.send({ type: "acceptChallenge", matchKey });
        });
    }

    async cancelChallenge(matchKey: string): Promise<void> {
        if (await this.connect()) this.room?.send({ type: "cancelChallenge", matchKey });
    }

    private handle(message: RivalsProtocol): void {
        switch (message.type) {
            case "directory": {
                const unresolvedInvitations = message.invitations.filter((invitation) => {
                    const match = store
                        .get()
                        .correspondenceMatches.find((entry) => entry.matchKey === invitation.matchKey);
                    const boardAlreadyOpened =
                        match && !match.incoming && (match.roomCode || match.phase !== "waiting");
                    if (boardAlreadyOpened) this.room?.send({ type: "acceptChallenge", matchKey: invitation.matchKey });
                    return !boardAlreadyOpened;
                });
                for (const invitation of unresolvedInvitations) correspondence.receiveInvitation(invitation);
                store.patch({
                    rivalDirectoryStatus: "ready",
                    rivalDirectoryError: null,
                    rivalRecommendations: message.recommendations,
                    rivalSearchResults: message.searchResults,
                    rivalSearchQuery: message.query,
                    rivalInvitations: unresolvedInvitations,
                });
                return;
            }
            case "challengeReceived":
                this.receiveInvitation(message.invitation);
                return;
            case "challengeSent": {
                const request = this.challengeRequests.get(message.requestId);
                if (!request) return;
                clearTimeout(request.timeout);
                this.challengeRequests.delete(message.requestId);
                request.resolve({ ok: true, target: message.target });
                return;
            }
            case "error": {
                if (!message.requestId) {
                    store.patch({ rivalDirectoryError: message.reason });
                    return;
                }
                const request = this.challengeRequests.get(message.requestId);
                if (!request) return;
                clearTimeout(request.timeout);
                this.challengeRequests.delete(message.requestId);
                request.resolve({ ok: false, error: message.reason });
                return;
            }
            case "challengeRemoved": {
                const acceptRequest = this.acceptRequests.get(message.matchKey);
                if (acceptRequest && message.reason === "accepted") {
                    clearTimeout(acceptRequest.timeout);
                    this.acceptRequests.delete(message.matchKey);
                    correspondence.markInvitationAccepted(message.matchKey);
                    acceptRequest.resolve(true);
                }
                if (message.reason === "cancelled") correspondence.removeReference(message.matchKey);
                store.patch({
                    rivalInvitations: store
                        .get()
                        .rivalInvitations.filter((invite) => invite.matchKey !== message.matchKey),
                });
                return;
            }
        }
    }

    private receiveInvitation(invitation: RivalInvitation): void {
        correspondence.receiveInvitation(invitation);
        const invitations = [
            invitation,
            ...store.get().rivalInvitations.filter((entry) => entry.matchKey !== invitation.matchKey),
        ];
        store.patch({
            rivalInvitations: invitations,
            toast: `${invitation.from.username} challenged you.`,
        });
        void saveSystem.flush();
    }
}

export const rivalsClient = new RivalsClient();
