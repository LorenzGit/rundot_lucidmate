#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { Clock, Logger, type GameRoomProps, type RoomProtocol } from "@series-inc/rundot-game-sdk/mp-server";
import ChessRoom from "../src/rooms/ChessRoom.ts";

const messages: Array<{ to: string | null; type: string; data: unknown }> = [];
const simulationCalls: Array<{ actor: string; recipe: string; input: Record<string, unknown> }> = [];
const players = new Map();
const protocol = {
    broadcast: (type: string, data: unknown) => messages.push({ to: null, type, data }),
    sendTo: (to: string, type: string, data: unknown) => messages.push({ to, type, data }),
    kick: () => undefined,
    lock: () => undefined,
    unlock: () => undefined,
    persist: () => undefined,
    handleCreate: async () => undefined,
    handleRestore: async () => undefined,
    handleJoin: async () => ({ accepted: false as const, reason: "not wired" }),
    handleMessage: async () => undefined,
    handleLeave: async () => undefined,
    handleDispose: async () => undefined,
    handleTick: async () => undefined,
    serializePersistState: () => ({}),
    getLocked: () => false,
    getPlayers: () => players,
} satisfies RoomProtocol;

const RoomHarness = ChessRoom as unknown as new (props: GameRoomProps) => ChessRoom;
new RoomHarness({
    protocol,
    roomId: "notification-room",
    roomType: "lucidmate-correspondence",
    config: { maxPlayers: 2, autoPersist: false },
    players,
    clock: new Clock(),
    log: new Logger({ roomId: "notification-room", roomType: "lucidmate-correspondence" }),
    services: {
        notifications: {
            send: async () => {
                assert.fail("async match alerts must not use the current-room-only notification service");
            },
        },
        simulation: {
            executeRecipe: async (actor, recipe, input = {}) => {
                simulationCalls.push({ actor, recipe, input });
                return {};
            },
            getState: async () => ({}),
            getActiveRuns: async () => [],
            getAvailableRecipes: async () => [],
            grantMeta: async () => undefined,
        },
        leaderboard: { submitScore: async () => undefined, getTop: async () => [] },
        ugc: { get: async () => null, recordUse: async () => undefined },
        economy: {
            claim: async () => ({ granted: 0, remaining: 0 }),
            contribute: async () => ({ remaining: 0 }),
            remaining: async () => 0,
        },
        getGameConfig: async () => ({}),
    },
});

const challenger = { id: "player-black", username: "Black Player", avatarUrl: null };
const recipient = { id: "player-white", username: "White Player", avatarUrl: null };
const matchKey = "lm-notification-flow-001";

await protocol.handleCreate();
assert.equal((await protocol.handleJoin(challenger)).accepted, true);
await protocol.handleMessage(challenger.id, "configure", { matchKey, pace: "daily", challenger, recipient });
assert.equal((await protocol.handleJoin(recipient)).accepted, true);
await protocol.handleMessage(recipient.id, "configure", { matchKey, pace: "daily", challenger, recipient });
await protocol.handleMessage(recipient.id, "move", { from: 12, to: 28, promotion: null });
await Promise.resolve();

assert.deepEqual(simulationCalls[0], {
    actor: recipient.id,
    recipe: "lucidmate_send_move_notification",
    input: { targetId: challenger.id, matchKey, pace: "daily", opponent: recipient.username },
});

// The opponent is no longer a current room member between async turns. The
// recipe still targets their validated reserved seat instead of being rejected
// by the room-only notification service.
await protocol.handleLeave(challenger.id, "leave");
await protocol.handleMessage(recipient.id, "react", { reaction: "nice_move" });
await Promise.resolve();
assert.equal(simulationCalls[1]?.recipe, "lucidmate_send_reaction_notification");
assert.equal(simulationCalls[1]?.input.targetId, challenger.id);

const config = JSON.parse(fs.readFileSync("rundot/simulation/social-notifications.json", "utf8"));
for (const recipe of [
    "lucidmate_send_challenge_notification",
    "lucidmate_send_move_notification",
    "lucidmate_send_reaction_notification",
    "lucidmate_send_rematch_notification",
]) {
    assert.ok(config.recipes[recipe], `${recipe} must ship in the server simulation config`);
}

console.log("room notifications: offline move and reaction routes use validated any-player recipes");
