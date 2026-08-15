#!/usr/bin/env node
/**
 * Invariants that a typechecker cannot see for LUCIDMATE.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
    return JSON.parse(read(relativePath));
}

function expect(condition, message) {
    if (!condition) failures.push(message);
}

function sourceFiles(directory) {
    const absolute = path.join(root, directory);
    if (!fs.existsSync(absolute)) return [];
    return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
        const relative = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(relative);
        return /\.(?:ts|tsx)$/.test(entry.name) ? [relative] : [];
    });
}

const sources = sourceFiles("src");

// Randomness — no Math.random in game logic (presentation-only files allowed)
const ALLOW_MATH_RANDOM = new Set([
    "src/game/scene/chessScene.ts", // bob phase presentation
]);
for (const file of sources) {
    const text = read(file);
    if (!/Math\.random\s*\(/.test(text)) continue;
    if (ALLOW_MATH_RANDOM.has(file)) continue;
    expect(false, `${file} uses Math.random(); game randomness must go through NoiseRandom`);
}

const platform = read("src/config/platform.ts");
const platformIds = Object.fromEntries(
    [...platform.matchAll(/^\s{4}(\w+):\s*"([^"]+)"/gm)].map((match) => [match[1], match[2]]),
);

const shop = readJson("rundot/shop.config.json");
const shopItemIds = new Set(shop.items.map((item) => item.itemId));
const shopEntitlementIds = new Set(shop.items.flatMap((item) => item.entitlements.map((e) => e.entitlementId)));

for (const key of ["piecePackItem", "themePackItem", "adFreeItem", "tripPassItem"]) {
    expect(
        shopItemIds.has(platformIds[key]),
        `PLATFORM_IDS.${key} (${platformIds[key]}) is not in rundot/shop.config.json`,
    );
}
for (const key of ["piecePackEntitlement", "themePackEntitlement", "adFreeEntitlement", "lavaThemeEntitlement"]) {
    expect(
        shopEntitlementIds.has(platformIds[key]),
        `PLATFORM_IDS.${key} (${platformIds[key]}) is granted by no shop item`,
    );
}

const runBitsItems = shop.items.filter((item) => item.active && item.price?.type === "bucks");
expect(runBitsItems.length > 0, "no active shop item is priced in Run Bits (price.type must be 'bucks')");
for (const item of shop.items) {
    expect(
        typeof item.price?.value === "string" && Number(item.price.value) > 0,
        `${item.itemId} has no positive price value`,
    );
    expect(item.entitlements.length > 0, `${item.itemId} grants no entitlement`);
}

const bundle = shop.items.find((item) => item.itemId === platformIds.tripPassItem);
const parts = [platformIds.themePackItem, platformIds.adFreeItem].map((id) =>
    shop.items.find((item) => item.itemId === id),
);
if (bundle && parts.every(Boolean)) {
    const partsTotal = parts.reduce((sum, item) => sum + Number(item.price.value), 0);
    expect(
        Number(bundle.price.value) < partsTotal,
        `the bundle (${bundle.price.value} RB) must cost less than its parts (${partsTotal} RB)`,
    );
}

const liveops = readJson("rundot/liveops.config.json");
const monetization = liveops.client?.values?.lucidmate_monetization;
expect(Boolean(monetization), "rundot/liveops.config.json has no lucidmate_monetization section");

if (monetization) {
    expect(monetization.enabled === true, "lucidmate_monetization.enabled must ship true");
    const config = read("src/systems/monetization/config.ts");
    const placementBlock = /export const PLACEMENT = \{([\s\S]*?)\} as const;/.exec(config)?.[1] ?? "";
    const placementIds = [...placementBlock.matchAll(/:\s*"([a-z_]+)"/g)].map((match) => match[1]);
    expect(placementIds.length === 4, `expected 4 placements in config.ts, parsed ${placementIds.length}`);
    for (const id of placementIds) {
        expect(
            monetization.placements?.[id]?.enabled === true,
            `placement "${id}" is missing or disabled in rundot/liveops.config.json`,
        );
    }
    for (const id of ["piece_pack", "theme_pack", "ad_free", "trip_pass"]) {
        expect(
            monetization.products?.[id]?.enabled === true,
            `product "${id}" is missing or disabled in rundot/liveops.config.json`,
        );
    }
    for (const [id, placement] of Object.entries(monetization.placements ?? {})) {
        expect(
            placement.dailyCap > 0 && placement.dailyCap <= 20,
            `${id} dailyCap ${placement.dailyCap} is out of range`,
        );
        expect(
            placement.sessionCap > 0 && placement.sessionCap <= placement.dailyCap,
            `${id} sessionCap ${placement.sessionCap} is out of range`,
        );
    }
}

const packageJson = readJson("package.json");
expect(packageJson.name === "lucidmate", `package.json name is "${packageJson.name}"`);
expect(!("three" in (packageJson.dependencies ?? {})), "three is still a dependency but no source imports it");
const gameConfig = readJson("game.config.prod.json");
expect(platformIds.gameId === gameConfig.gameId, "PLATFORM_IDS.gameId must match game.config.prod.json");
expect(!platformIds.gameId.startsWith("REPLACE_WITH_"), "RUN game id is still a placeholder");

const runSdk = read("src/sdk/runSdk.ts");
const runtimeServices = read("src/systems/runtimeServices.ts");
expect(/system\.getDevice\(\)/.test(runSdk), "haptics capability must come from the live RUN device");
expect(/triggerHapticAsync/.test(runSdk), "RUN haptic feedback is not wired");
expect(/hapticsEnabled \? triggerHaptic/.test(runtimeServices), "persisted haptics opt-out does not gate feedback");
const settingsScreen = read("src/ui/SettingsScreen.tsx");
const notificationPreference = read("src/systems/notificationPreference.ts");
expect(/updateNotificationPreference/.test(settingsScreen), "settings has no notification consent action");
expect(
    /channels:\s*\["local"\]/.test(runSdk) && !/channels:\s*\["push"\]/.test(runSdk),
    "settings notification test must use the public local channel until typed remote push ships",
);
expect(
    /returnReminders\.cancelAll/.test(notificationPreference),
    "notification opt-out does not cancel pending reminders",
);
expect(/returnReminders\.refreshAll/.test(notificationPreference), "notification opt-in does not arm reminders");

const realtime = readJson("rundot/realtime.config.json");
const correspondenceRoom = realtime.rooms.find((room) => room.type === "lucidmate-correspondence");
expect(correspondenceRoom?.persistent === true, "correspondence room must remain persistent across deploys");
expect(correspondenceRoom?.config?.maxPlayers === 2, "correspondence room must be strictly two-player");
expect(
    correspondenceRoom?.config?.allowReconnect === false && correspondenceRoom?.config?.reconnectTimeout === 0,
    "async rooms release suspended sockets immediately so a fresh iOS webview can reclaim its saved seat",
);
const socialModel = read("src/social/model.ts");
expect(/CHESS_REACTIONS/.test(socialModel), "multiplayer reactions need an explicit safe allowlist");
const rivalsClient = read("src/social/rivalsClient.ts");
expect(
    /criteria:\s*\{\s*directory:\s*RIVALS_DIRECTORY_KEY\s*\}/.test(rivalsClient),
    "rival discovery must keep local/legacy routers on one directory room",
);
const roomServer = read("src/rooms/ChessRoom.ts");
expect(
    /this\.reason = this\.winner \? "resign" : "cancelled"/.test(roomServer),
    "waiting challenges cancel without awarding a win",
);
const onlineClient = read("src/game/chess/onlineClient.ts");
expect(/canUseAuthoritativeRealtime/.test(onlineClient), "offline multiplayer mock must not fabricate join success");
expect(
    /RundotGameAPI\.isMock\(\)/.test(onlineClient) && /_roomServerUrl/.test(onlineClient),
    "authoritative multiplayer requires a non-mock host with a positive room-server URL",
);
expect(
    /playground\.roomServerUrl && playground\.versionTag/.test(onlineClient),
    "Playground multiplayer requires a configured hosted room server and version tag",
);
expect(/persistentKey: matchKey/.test(onlineClient), "saved boards must recover through their persistent match key");
expect(
    /criteria:\s*\{\s*matchKey\s*\}/.test(onlineClient),
    "saved boards must also partition legacy/local room matching by match key",
);
expect(
    /joinRoomByCode<ChessProtocol>\(knownRoomCode\)/.test(onlineClient),
    "saved boards rejoin the exact warm room first",
);
expect(/ROOM_STATE_TIMEOUT_MS = 12_000/.test(onlineClient), "cold room state has a realistic bounded wait");
expect(
    /onDisconnect:[\s\S]*?this\.setStatus\("disconnected"/.test(onlineClient) &&
        !/onDisconnect:[\s\S]{0,160}?this\.room\s*=\s*null/.test(onlineClient),
    "temporary disconnects retain the room so SDK reconnection can complete",
);
expect(
    /DUPLICATE_SESSION_RETRY_MS/.test(onlineClient) &&
        /isDuplicateSessionError/.test(onlineClient) &&
        /void this\.connectCorrespondence\(matchKey, pace, roomCode\)/.test(onlineClient),
    "async resume retries the same board without exposing a duplicate-session failure",
);
const runController = read("src/game/runController.ts");
expect(!/inboxTimer/.test(runController), "correspondence moves must not schedule a forced menu redirect");
expect(/Move sent — waiting for/.test(runController), "confirmed correspondence moves remain on the board");
expect(
    /reconnectingInGame[\s\S]*?onlineStatus:\s*"error"/.test(runController),
    "failed retries retain the active board",
);
expect(/onlineStateHydrated/.test(runController), "reconnect hydration is distinct from a newly received move");
expect(
    /lucidmate_send_move_notification/.test(roomServer) &&
        /services\.notifications\.send/.test(roomServer) &&
        /services\.simulation\.executeRecipe/.test(roomServer) &&
        /eventKey/.test(roomServer),
    "turn alerts use the native room bridge with an event-keyed protected fallback",
);
const socialNotifications = readJson("rundot/simulation/social-notifications.json");
for (const [recipeId, recipe] of Object.entries(socialNotifications.recipes ?? {})) {
    expect(
        !("inputs" in recipe),
        `${recipeId} message parameters must not be declared as simulation inventory entities`,
    );
    const effect = recipe.beginEffects?.[0] ?? {};
    expect(
        !("roomNotification" in effect) && !("saveToInbox" in effect),
        `${recipeId} must use the released SDK 5.24 push-only recipe schema until Venus #3849 ships`,
    );
}
expect(
    /this\.reaction\.moveCount === this\.moveCount/.test(roomServer) && /color !== this\.turn/.test(roomServer),
    "the room must enforce one reaction on the sender's turn",
);
const chessScene = read("src/game/scene/chessScene.ts");
expect(
    /private relayout\(\)[\s\S]*?this\.moving = false;[\s\S]*?this\.repositionPieces\(\)/.test(chessScene),
    "resize atomically cancels stale motion and reflows every piece",
);
expect(
    /const impactShake = moveShakeMagnitude\(move\.capture\)/.test(chessScene) &&
        /if \(impactShake > 0\) this\.shake = Math\.max/.test(chessScene),
    "camera shake is routed through capture-only move feedback",
);
expect(
    !/move\.capture \? 5 : 2\.5/.test(chessScene) && !/snap\.status === "checkmate" \? 14 : 9/.test(chessScene),
    "quiet moves, check, and checkmate do not shake the camera",
);

for (const file of [...sources, "index.html", "src/styles/app.css", "README.md"]) {
    if (!fs.existsSync(path.join(root, file))) continue;
    const text = read(file);
    for (const leftover of ["PIXEL FOUNDRY", "Pixel Foundry", "pixel-foundry", "rundot_template"]) {
        expect(!text.includes(leftover), `${file} still mentions the template identity "${leftover}"`);
    }
}

// base path for RUN deploy
const vite = read("vite.config.js");
expect(/base:\s*["']\.\/["']/.test(vite), 'vite.config.js must set base: "./"');

if (failures.length) {
    console.error("check-game failures:");
    for (const f of failures) console.error(" -", f);
    process.exit(1);
}
console.log("check-game: ok");
