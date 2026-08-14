#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { Clock, Logger, type GameRoomProps, type RoomProtocol } from "@series-inc/rundot-game-sdk/mp-server";
import ChessRoom from "../src/rooms/ChessRoom.ts";

const messages: Array<{ to: string | null; type: string; data: unknown }> = [];
const notificationCalls: Array<Record<string, unknown>> = [];
const simulationCalls: Array<{ actor: string; recipe: string; input: Record<string, unknown> }> = [];
let releaseFirstMoveNotification: (() => void) | null = null;
const firstMoveNotification = new Promise<void>((resolve) => {
    releaseFirstMoveNotification = resolve;
});
let rejectNextDirectMoveNotification = false;
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
            send: async (request) => {
                notificationCalls.push(request as unknown as Record<string, unknown>);
                const moveCalls = notificationCalls.filter((call) => call.template === "lucidmate_your_move");
                if (request.template === "lucidmate_your_move" && moveCalls.length === 1) {
                    await firstMoveNotification;
                }
                if (request.template === "lucidmate_your_move" && rejectNextDirectMoveNotification) {
                    rejectNextDirectMoveNotification = false;
                    throw new Error("notification broker unavailable");
                }
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

// Illegal moves never generate alerts.
await protocol.handleMessage(recipient.id, "move", { from: 12, to: 36, promotion: null });
assert.equal(simulationCalls.length, 0);
assert.equal(notificationCalls.length, 0);

// The room must await the broker. Fire-and-forget work can be dropped
// when an idle correspondence room freezes immediately after a move.
let firstMoveHandled = false;
const firstMoveRequest = protocol.handleMessage(recipient.id, "move", { from: 12, to: 28, promotion: null });
void firstMoveRequest.then(() => {
    firstMoveHandled = true;
});
await Promise.resolve();
assert.equal(firstMoveHandled, false, "move handler returned before the notification broker completed");
releaseFirstMoveNotification?.();
await firstMoveRequest;
assert.equal(firstMoveHandled, true);

assert.deepEqual(notificationCalls[0], {
    recipientProfileIds: [challenger.id],
    template: "lucidmate_your_move",
    params: { opponent: recipient.username },
    data: {
        route: "match",
        matchKey,
        pace: "daily",
        eventKey: "turn_1",
        turn: 1,
    },
    fallbackTitle: "Your move in LUCIDMATE",
    fallbackBody: `${recipient.username} moved. Your board is waiting.`,
});
assert.equal(simulationCalls.length, 0, "current room members use the SDK-native notification bridge");
// Reactions are available only to the player whose turn it is.
await protocol.handleMessage(recipient.id, "react", { reaction: "nice_move" });
assert.equal(notificationCalls.length, 1, "out-of-turn reaction is rejected");
const outOfTurnError = messages.findLast((message) => message.to === recipient.id && message.type === "error")?.data as
    | { reason: string }
    | undefined;
assert.equal(outOfTurnError?.reason, "Reactions unlock on your turn");
await protocol.handleMessage(challenger.id, "react", { reaction: "nice_move" });
assert.equal(notificationCalls[1]?.template, "lucidmate_reaction");
const firstReactionData = notificationCalls[1]?.data as Record<string, unknown> | undefined;
assert.equal(firstReactionData?.eventKey, "reaction_1_nice_move");
await protocol.handleMessage(challenger.id, "react", { reaction: "good_game" });
assert.equal(notificationCalls.length, 2, "a second reaction in the same turn is rejected");
const duplicateReactionError = messages.findLast((message) => message.to === challenger.id && message.type === "error")
    ?.data as { reason: string } | undefined;
assert.equal(duplicateReactionError?.reason, "You already reacted this turn");

// Delivery failure is logged, but it never rolls back an already accepted move.
rejectNextDirectMoveNotification = true;
await protocol.handleMessage(challenger.id, "move", { from: 52, to: 36, promotion: null });
assert.equal(notificationCalls[2]?.template, "lucidmate_your_move");
assert.equal(simulationCalls[0]?.recipe, "lucidmate_send_move_notification", "protected recipe backs up direct push");
const latestState = messages.findLast((message) => message.type === "state")?.data as
    | { turn?: string; moveCount?: number }
    | undefined;
assert.equal(latestState?.turn, "w");
assert.equal(latestState?.moveCount, 2);

// The protected recipe still targets a validated reserved seat after its live
// room membership expires.
await protocol.handleLeave(challenger.id, "leave");
await protocol.handleMessage(recipient.id, "react", { reaction: "nice_move" });
assert.equal(simulationCalls[1]?.recipe, "lucidmate_send_reaction_notification");
assert.equal(simulationCalls[1]?.input.targetId, challenger.id);
assert.equal(simulationCalls[1]?.input.eventKey, "reaction_2_nice_move");

await protocol.handleMessage(recipient.id, "move", { from: 6, to: 21, promotion: null });
assert.equal(simulationCalls[2]?.input.eventKey, "turn_3");
assert.equal((await protocol.handleJoin(challenger)).accepted, true);
await protocol.handleMessage(challenger.id, "configure", { matchKey, pace: "daily", challenger, recipient });
await protocol.handleMessage(challenger.id, "react", { reaction: "good_game" });
const nextTurnReactionData = notificationCalls[3]?.data as Record<string, unknown> | undefined;
assert.equal(nextTurnReactionData?.eventKey, "reaction_3_good_game", "reaction unlocks on the next turn");

const config = JSON.parse(fs.readFileSync("rundot/simulation/social-notifications.json", "utf8"));
const inbox = JSON.parse(fs.readFileSync("rundot/inbox.config.json", "utf8"));
for (const recipe of [
    "lucidmate_send_challenge_notification",
    "lucidmate_send_move_notification",
    "lucidmate_send_reaction_notification",
    "lucidmate_send_rematch_notification",
]) {
    assert.ok(config.recipes[recipe], `${recipe} must ship in the server simulation config`);
    const effect = config.recipes[recipe].beginEffects[0];
    assert.equal(effect.type, "send_inbox_message", `${recipe} uses the supported inbox broker`);
    assert.ok(inbox.templates[effect.template], `${recipe} references a shipped inbox template`);
    assert.equal(effect.payload.route, "match", `${recipe} deep-links to a match`);
    assert.equal(effect.payload.matchKey, "{{inputs.matchKey}}", `${recipe} routes to the exact board`);
    assert.equal(effect.roomNotification.roomId, "{{inputs.matchKey}}", `${recipe} persists against the exact board`);
    assert.equal(
        effect.roomNotification.notificationKey,
        "{{inputs.eventKey}}",
        `${recipe} deduplicates the exact event`,
    );
    assert.equal(
        "inputs" in config.recipes[recipe],
        false,
        `${recipe} must not declare message parameters as inventory entities`,
    );
}

console.log("room notifications: protected push delivery, exact-board routing, one reaction per turn");
