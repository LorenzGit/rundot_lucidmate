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
            getGameConfig: async () => ({ thumbnailUrl: "https://cdn.test/lucidmate.jpg" }),
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

// A connected socket may belong to a backgrounded phone. It still gets an alert.
await room.protocol.handleMessage(recipient.id, "move", { from: 12, to: 28, promotion: null });
assert.equal(room.notificationCalls.length, 1, "connected recipients still receive move alerts");
assert.equal(room.simulationCalls.length, 1, "connected recipients still receive the inbox row");
assert.equal(room.simulationCalls[0]?.input.eventKey, "turn_1");
room.notificationCalls.length = 0;
room.simulationCalls.length = 0;

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

// The reply gets a distinct turn key even though both sockets remain connected.
await room.protocol.handleMessage(challenger.id, "move", { from: 52, to: 36, promotion: null });
assert.equal(room.notificationCalls.length, 2);
assert.equal(room.simulationCalls[0]?.input.eventKey, "turn_2");
room.notificationCalls.pop();
room.simulationCalls.length = 0;

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
    position: "f3",
});
assert.deepEqual(room.notificationCalls[1], {
    recipientProfileIds: [challenger.id],
    template: "lucidmate_your_move",
    params: { opponent: recipient.username, position: "f3" },
    data: {
        route: "match",
        matchKey,
        pace: "daily",
        eventKey: "turn_3",
        notificationKey: "turn_3",
        payload: JSON.stringify({ route: "match", matchKey, pace: "daily" }),
        turn: 3,
        iconUrl: "https://cdn.test/lucidmate.jpg",
        imageUrl: "https://cdn.test/lucidmate.jpg",
    },
    fallbackTitle: "Your move in LUCIDMATE",
    fallbackBody: `${recipient.username} moved to f3. Tap here to complete your turn!`,
});

// Reconnecting does not suppress subsequent moves.
await room.protocol.handleMessage(challenger.id, "__system:reconnected", {});
await room.protocol.handleMessage(challenger.id, "move", { from: 51, to: 35, promotion: null });
assert.equal(room.simulationCalls.at(-1)?.input.eventKey, "turn_4");
assert.equal(room.notificationCalls.length, 3);
room.simulationCalls.pop();
room.notificationCalls.pop();

// Reactions to a departed member still fall through to the protected recipe.
await room.protocol.handleLeave(challenger.id, "leave");
await room.protocol.handleMessage(recipient.id, "react", { reaction: "nice_move" });
assert.equal(room.simulationCalls[1]?.recipe, "lucidmate_send_reaction_notification");
assert.equal(room.simulationCalls[1]?.input.targetId, challenger.id);
assert.equal(room.simulationCalls[1]?.input.eventKey, "reaction_4_nice_move");
assert.equal(room.simulationCalls[1]?.input.roomId, ROOM_ID);
assert.equal(room.simulationCalls[1]?.input.matchKey, matchKey);

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
assert.equal(room.simulationCalls[3]?.input.roomId, ROOM_ID);
assert.equal(room.simulationCalls[3]?.input.matchKey, matchKey);

// The same logical turn, replayed on the same board, keys the same inbox row —
// a retry updates one message instead of stacking another.
const replay = createRoom(ROOM_ID);
await seatBothPlayers(replay);
await replay.protocol.handleMessage(recipient.id, "move", { from: 12, to: 28, promotion: null });
await replay.protocol.handleMessage(challenger.id, "move", { from: 52, to: 36, promotion: null });
replay.simulationCalls.length = 0;
replay.notificationCalls.length = 0;
await replay.protocol.handleMessage(challenger.id, "__system:disconnected", {});
await replay.protocol.handleMessage(recipient.id, "move", { from: 6, to: 21, promotion: null });
assert.deepEqual(replay.simulationCalls[0]?.input, turnRecipe?.input, "a replayed turn reuses room id and event key");

// A slow recipe must not relabel its push with a later move's turn number.
const overlapping = createRoom("overlapping-turns");
await seatBothPlayers(overlapping);
let releaseFirst!: () => void;
overlapping.hooks.holdMoveRecipe = new Promise<void>((resolve) => {
    releaseFirst = resolve;
});
const firstMove = overlapping.protocol.handleMessage(recipient.id, "move", { from: 12, to: 28 });
await overlapping.protocol.handleMessage(challenger.id, "move", { from: 52, to: 36 });
releaseFirst();
await firstMove;
for (const call of overlapping.notificationCalls) {
    const data = call.data as Record<string, unknown>;
    assert.equal(data.notificationKey, `turn_${data.turn}`, "both transports identify the original move");
}
assert.deepEqual(
    overlapping.notificationCalls.map((call) => (call.data as Record<string, unknown>).turn),
    [2, 1],
);

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
    assert.deepEqual(
        effect.roomNotification,
        {
            sourceType: recipe === "lucidmate_send_move_notification" ? "room_turn" : "room_message",
            roomId: "{{inputs.roomId}}",
            notificationKey: "{{inputs.eventKey}}",
        },
        `${recipe} requests one durable room-keyed inbox row`,
    );
    if (recipe === "lucidmate_send_move_notification") {
        assert.equal(effect.params.position, "{{inputs.position}}", "turn alerts name the destination square");
        assert.equal(
            inbox.templates.lucidmate_your_move.text.en,
            "{{opponent}} moved to {{position}}. Tap here to complete your turn!",
            "turn push copy names the move and asks the player to finish their turn",
        );
    }
}

console.log("room notifications: connected and disconnected recipients, durable room-keyed inbox, exact-board routing");
