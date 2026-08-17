#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { Clock, Logger, type GameRoomProps, type RoomProtocol } from "@series-inc/rundot-game-sdk/mp-server";
import ChessRoom from "../src/rooms/ChessRoom.ts";

type RoomMessage = { to: string | null; type: string; data: unknown };
type RecipeCall = { actor: string; recipe: string; input: Record<string, unknown> };
type Harness = {
    protocol: RoomProtocol;
    messages: RoomMessage[];
    notificationCalls: Array<Record<string, unknown>>;
    simulationCalls: RecipeCall[];
    /** Test-controlled brokers: hold the next turn recipe, fail the next turn push. */
    hooks: { holdMoveRecipe: Promise<void> | null; failNextMovePush: boolean };
};

const RoomHarness = ChessRoom as unknown as new (props: GameRoomProps) => ChessRoom;

function createRoom(roomId: string): Harness {
    const messages: RoomMessage[] = [];
    const notificationCalls: Array<Record<string, unknown>> = [];
    const simulationCalls: RecipeCall[] = [];
    const hooks: Harness["hooks"] = { holdMoveRecipe: null, failNextMovePush: false };
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

    new RoomHarness({
        protocol,
        roomId,
        roomType: "lucidmate-correspondence",
        config: { maxPlayers: 2, autoPersist: false },
        players,
        clock: new Clock(),
        log: new Logger({ roomId, roomType: "lucidmate-correspondence" }),
        services: {
            notifications: {
                send: async (request) => {
                    notificationCalls.push(request as unknown as Record<string, unknown>);
                    if (request.template === "lucidmate_your_move" && hooks.failNextMovePush) {
                        hooks.failNextMovePush = false;
                        throw new Error("notification broker unavailable");
                    }
                },
            },
            simulation: {
                executeRecipe: async (actor, recipe, input = {}) => {
                    if (recipe === "lucidmate_send_move_notification" && hooks.holdMoveRecipe) {
                        const gate = hooks.holdMoveRecipe;
                        hooks.holdMoveRecipe = null;
                        await gate;
                    }
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

    return { protocol, messages, notificationCalls, simulationCalls, hooks };
}

const challenger = { id: "player-black", username: "Black Player", avatarUrl: null };
const recipient = { id: "player-white", username: "White Player", avatarUrl: null };
const matchKey = "lm-notification-flow-001";
const ROOM_ID = "notification-room";

/** Seats the invited player as White and starts the board. */
async function seatBothPlayers(room: Harness): Promise<void> {
    await room.protocol.handleCreate();
    assert.equal((await room.protocol.handleJoin(challenger)).accepted, true);
    await room.protocol.handleMessage(challenger.id, "configure", { matchKey, pace: "daily", challenger, recipient });
    assert.equal((await room.protocol.handleJoin(recipient)).accepted, true);
    await room.protocol.handleMessage(recipient.id, "configure", { matchKey, pace: "daily", challenger, recipient });
}

const room = createRoom(ROOM_ID);
await seatBothPlayers(room);

// Illegal moves never generate alerts.
await room.protocol.handleMessage(recipient.id, "move", { from: 12, to: 36, promotion: null });
assert.equal(room.simulationCalls.length, 0);
assert.equal(room.notificationCalls.length, 0);

// A rival who is still in the room sees the move in the state broadcast, so the
// turn alert is suppressed on both channels.
await room.protocol.handleMessage(recipient.id, "move", { from: 12, to: 28, promotion: null });
assert.equal(room.notificationCalls.length, 0, "a watching rival is never pushed a turn alert");
assert.equal(room.simulationCalls.length, 0, "a watching rival never receives a durable inbox row");

// Reactions are available only to the player whose turn it is.
await room.protocol.handleMessage(recipient.id, "react", { reaction: "nice_move" });
assert.equal(room.notificationCalls.length, 0, "out-of-turn reaction is rejected");
const outOfTurnError = room.messages.findLast((message) => message.to === recipient.id && message.type === "error")
    ?.data as { reason: string } | undefined;
assert.equal(outOfTurnError?.reason, "Reactions unlock on your turn");

// Reactions to a room member keep their direct push delivery.
await room.protocol.handleMessage(challenger.id, "react", { reaction: "nice_move" });
assert.equal(room.notificationCalls[0]?.template, "lucidmate_reaction");
const firstReactionData = room.notificationCalls[0]?.data as Record<string, unknown> | undefined;
assert.equal(firstReactionData?.eventKey, "reaction_1_nice_move");
assert.equal(room.simulationCalls.length, 0, "a room member's reaction stays on the direct bridge");
await room.protocol.handleMessage(challenger.id, "react", { reaction: "good_game" });
assert.equal(room.notificationCalls.length, 1, "a second reaction in the same turn is rejected");
const duplicateReactionError = room.messages.findLast(
    (message) => message.to === challenger.id && message.type === "error",
)?.data as { reason: string } | undefined;
assert.equal(duplicateReactionError?.reason, "You already reacted this turn");

// The reply alerts nobody either: White is watching too.
await room.protocol.handleMessage(challenger.id, "move", { from: 52, to: 36, promotion: null });
assert.equal(room.notificationCalls.length, 1);
assert.equal(room.simulationCalls.length, 0);

// A rival whose socket dropped is no longer watching, even during the SDK
// reconnect grace period, and must get the durable inbox row.
await room.protocol.handleMessage(challenger.id, "__system:disconnected", {});
let thirdMoveHandled = false;
let releaseThirdMoveRecipe: (() => void) | null = null;
room.hooks.holdMoveRecipe = new Promise<void>((resolve) => {
    releaseThirdMoveRecipe = resolve;
});
const thirdMoveRequest = room.protocol.handleMessage(recipient.id, "move", { from: 6, to: 21, promotion: null });
void thirdMoveRequest.then(() => {
    thirdMoveHandled = true;
});
await Promise.resolve();
assert.equal(thirdMoveHandled, false, "move handler returned before the inbox recipe completed");
releaseThirdMoveRecipe?.();
await thirdMoveRequest;

const turnRecipe = room.simulationCalls[0];
assert.equal(turnRecipe?.recipe, "lucidmate_send_move_notification");
assert.equal(turnRecipe?.actor, recipient.id);
assert.deepEqual(turnRecipe?.input, {
    targetId: challenger.id,
    roomId: ROOM_ID,
    matchKey,
    pace: "daily",
    eventKey: "turn_3",
    opponent: recipient.username,
});
assert.deepEqual(room.notificationCalls[1], {
    recipientProfileIds: [challenger.id],
    template: "lucidmate_your_move",
    params: { opponent: recipient.username },
    data: {
        route: "match",
        matchKey,
        pace: "daily",
        eventKey: "turn_3",
        turn: 3,
    },
    fallbackTitle: "Your move in LUCIDMATE",
    fallbackBody: `${recipient.username} moved. Your board is waiting.`,
});

// Reconnecting restores the silent path.
await room.protocol.handleMessage(challenger.id, "__system:reconnected", {});
await room.protocol.handleMessage(challenger.id, "move", { from: 51, to: 35, promotion: null });
assert.equal(room.simulationCalls.length, 1, "a reconnected rival is watching again");
assert.equal(room.notificationCalls.length, 2);

// Reactions to a departed member still fall through to the protected recipe.
await room.protocol.handleLeave(challenger.id, "leave");
await room.protocol.handleMessage(recipient.id, "react", { reaction: "nice_move" });
assert.equal(room.simulationCalls[1]?.recipe, "lucidmate_send_reaction_notification");
assert.equal(room.simulationCalls[1]?.input.targetId, challenger.id);
assert.equal(room.simulationCalls[1]?.input.eventKey, "reaction_4_nice_move");

// A failed push never withdraws or blocks the inbox row.
room.hooks.failNextMovePush = true;
await room.protocol.handleMessage(recipient.id, "move", { from: 1, to: 18, promotion: null });
assert.equal(room.notificationCalls[2]?.template, "lucidmate_your_move", "the push is still attempted");
assert.equal(room.simulationCalls[2]?.recipe, "lucidmate_send_move_notification");
assert.equal(room.simulationCalls[2]?.input.eventKey, "turn_5", "the inbox row survives a failed push");
const latestState = room.messages.findLast((message) => message.type === "state")?.data as
    | { turn?: string; moveCount?: number }
    | undefined;
assert.equal(latestState?.turn, "b");
assert.equal(latestState?.moveCount, 5);

// Rematch offers keep their existing delivery through the protected recipe.
await room.protocol.handleMessage(recipient.id, "resign", {});
await room.protocol.handleMessage(recipient.id, "rematch", { matchKey: "lm-notification-flow-002" });
assert.equal(room.simulationCalls[3]?.recipe, "lucidmate_send_rematch_notification");
assert.equal(room.simulationCalls[3]?.input.targetId, challenger.id);
assert.equal(room.simulationCalls[3]?.input.eventKey, "rematch_lm-notification-flow-002");

// The same logical turn, replayed on the same board, keys the same inbox row —
// a retry updates one message instead of stacking another.
const replay = createRoom(ROOM_ID);
await seatBothPlayers(replay);
await replay.protocol.handleMessage(recipient.id, "move", { from: 12, to: 28, promotion: null });
await replay.protocol.handleMessage(challenger.id, "move", { from: 52, to: 36, promotion: null });
await replay.protocol.handleMessage(challenger.id, "__system:disconnected", {});
await replay.protocol.handleMessage(recipient.id, "move", { from: 6, to: 21, promotion: null });
assert.deepEqual(replay.simulationCalls[0]?.input, turnRecipe?.input, "a replayed turn reuses room id and event key");

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
    assert.equal("saveToInbox" in effect, false, `${recipe} cannot request the unreleased inbox persistence contract`);
    assert.equal(
        "inputs" in config.recipes[recipe],
        false,
        `${recipe} must not declare message parameters as inventory entities`,
    );
    if (recipe === "lucidmate_send_move_notification") {
        assert.deepEqual(
            effect.roomNotification,
            {
                sourceType: "room_turn",
                roomId: "{{inputs.roomId}}",
                notificationKey: "{{inputs.eventKey}}",
            },
            "turn alerts request one durable room-keyed inbox row",
        );
    } else {
        assert.equal("roomNotification" in effect, false, `${recipe} stays on the push-only recipe schema`);
    }
}

console.log("room notifications: silent while watching, durable room-keyed inbox off-room, exact-board routing");
