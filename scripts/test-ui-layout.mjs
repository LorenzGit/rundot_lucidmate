#!/usr/bin/env node
/**
 * Real entry tests for LUCIDMATE layout + identity + helper chrome gates.
 * Imports shipped layout helpers; does not re-derive reserve constants.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
    BOARD_FRAME_PAD,
    bottomReserveFor,
    computeBoardLayout,
    LANDSCAPE_RAIL_EDGE,
    LANDSCAPE_RAIL_GAP,
    LANDSCAPE_RAIL_WIDTH,
    topReserveFor,
} from "../src/game/scene/layout.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;

function assert(cond, msg) {
    if (!cond) {
        failures += 1;
        console.error("FAIL:", msg);
    } else {
        console.log("ok:", msg);
    }
}

// --- Landscape board and controls never compete for the same column -------
{
    const designWidth = 1_560;
    const designHeight = 720;
    const insets = { top: 0, right: 34, left: 62, bottom: 0 };
    const layout = computeBoardLayout(designWidth, designHeight, insets);
    const railStart = designWidth - Math.max(insets.right, LANDSCAPE_RAIL_EDGE) - LANDSCAPE_RAIL_WIDTH;
    assert(
        layout.originX + layout.size + LANDSCAPE_RAIL_GAP <= railStart + 0.001,
        "landscape board ends before the HUD rail",
    );
}

// --- Full-width board layout (shipped computeBoardLayout + constants) -----
{
    const designWidth = 720;
    const designHeight = 1280;
    const insets = { top: 44, right: 0, left: 0, bottom: 34 };
    const layout = computeBoardLayout(designWidth, designHeight, insets);
    const sidePadL = insets.left + BOARD_FRAME_PAD;
    const sidePadR = insets.right + BOARD_FRAME_PAD;
    const availableW = designWidth - sidePadL - sidePadR;
    const availableH = designHeight - topReserveFor(insets) - bottomReserveFor(insets);
    assert(layout.size <= availableW + 0.001, `board size ${layout.size} fits width band ${availableW}`);
    if (availableW <= availableH) {
        assert(
            Math.abs(layout.size - availableW) < 0.01,
            `width-first: size ${layout.size} === availableW ${availableW}`,
        );
    }
    const expectedOriginX = sidePadL + (availableW - layout.size) / 2;
    assert(
        Math.abs(layout.originX - expectedOriginX) < 0.01,
        `originX centered (got ${layout.originX}, want ${expectedOriginX})`,
    );
    // Symmetric gutters when safe-area left/right are equal
    const leftGutter = layout.originX;
    const rightGutter = designWidth - (layout.originX + layout.size);
    assert(Math.abs(leftGutter - rightGutter) < 0.01, `symmetric gutters L=${leftGutter} R=${rightGutter}`);

    const asymmetric = computeBoardLayout(720, 1280, { top: 0, right: 20, left: 40, bottom: 0 });
    const aw = 720 - (40 + BOARD_FRAME_PAD) - (20 + BOARD_FRAME_PAD);
    const ox = 40 + BOARD_FRAME_PAD + (aw - asymmetric.size) / 2;
    assert(Math.abs(asymmetric.originX - ox) < 0.01, `asymmetric safe-area centering ${asymmetric.originX}≈${ox}`);
}

// --- Helper bar chrome: 3-column grid edge-to-edge (shipped CSS + Hud) ------
{
    const css = fs.readFileSync(path.join(root, "src/styles/app.css"), "utf8");
    assert(
        /\.helper-bar\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr\s+1fr/.test(css),
        "CSS .helper-bar uses grid-template-columns: 1fr 1fr 1fr",
    );
    assert(
        /\.helper-bar\s*\{[^}]*width:\s*100%/.test(css) || /\.helper-bar\s*\{[^}]*inset:\s*auto 0 0 0/.test(css),
        "CSS .helper-bar is edge-to-edge (width 100% or inset auto 0 0 0)",
    );
    assert(
        /\.helper-btn\s*\{[^}]*width:\s*100%/.test(css) ||
            /\.helper-button,\s*\n?\.helper-btn\s*\{[^}]*width:\s*100%/.test(css),
        "CSS .helper-btn is width 100% of its grid cell",
    );
    const hud = fs.readFileSync(path.join(root, "src/ui/Hud.tsx"), "utf8");
    assert(/className=\{`helper-btn/.test(hud) || /className="helper-btn/.test(hud), "Hud uses helper-btn class");
    assert(/helper-auras/.test(hud), "Hud uses helper-auras class");
}

// --- Board intro never uses left-pivot scale shrink -------------------------
{
    const scene = fs.readFileSync(path.join(root, "src/game/scene/chessScene.ts"), "utf8");
    assert(!/boardLayer\.scale\.set\(0\.9/.test(scene), "no boardLayer scale intro from 0.9x");
    assert(
        /boardLayer\.scale\.x !== 1[\s\S]*boardLayer\.scale\.set\(1\)/.test(scene),
        "update() scale failsafe forces boardLayer.scale to 1",
    );
    assert(!/boardLayer\.alpha\s*=\s*0/.test(scene), "chessScene never sets boardLayer.alpha = 0");
    assert(
        /boardLayer\.alpha\s*<\s*1[\s\S]*boardLayer\.alpha\s*=\s*1/.test(scene),
        "chessScene failsafe restores alpha",
    );
    assert(
        /root\.scale\.set\(0\.55\)/.test(scene) && !/root\.scale\.set\(0\)/.test(scene),
        "pieces intro from 0.55 not 0",
    );
}

// --- Player-facing identity ------------------------------------------------
{
    const forbidden = [
        /atelier/i,
        /leadlight/i,
        /stained\s*glass/i,
        /PIXEL FOUNDRY/i,
        /glazier/i,
        /cullet/i,
        /chisel/i,
        /kiln/i,
        /LabelShards/,
        /ClaimShards/,
        /ResultsBench/,
    ];
    const files = [
        "src/assets/strings.csv",
        "src/ui/MainMenu.tsx",
        "src/ui/Hud.tsx",
        "src/ui/LoadingScreen.tsx",
        "src/ui/DailyRewardsScreen.tsx",
        "src/ui/DailyQuestsScreen.tsx",
        "src/ui/LoungeScreen.tsx",
        "src/systems/commerce.ts",
        "src/systems/retention/retentionConfig.ts",
    ];
    for (const rel of files) {
        const text = fs.readFileSync(path.join(root, rel), "utf8");
        for (const re of forbidden) {
            assert(!re.test(text), `${rel} free of ${re}`);
        }
    }
    const css = fs.readFileSync(path.join(root, "src/styles/app.css"), "utf8");
    assert(/^\/\*[\s\S]*?LUCIDMATE/m.test(css.slice(0, 800)), "app.css header identifies LUCIDMATE");
    assert(!/LEADLIGHT — Stained Glass/i.test(css.slice(0, 400)), "app.css header is not LEADLIGHT atelier");
}

// --- Reduced-motion settle rules -------------------------------------------
{
    const css = fs.readFileSync(path.join(root, "src/styles/app.css"), "utf8");
    assert(
        /html\[data-reduced-motion="true"\][\s\S]*?\.match-in[\s\S]*?opacity:\s*1/.test(css),
        "reduced-motion forces match-in visible",
    );
    assert(
        /data-reduced-motion="true"[\s\S]*?animation:\s*none/.test(css),
        "reduced-motion disables decorative animation",
    );
}

// --- Player-facing setup and turn ownership copy ---------------------------
{
    const practice = fs.readFileSync(path.join(root, "src/ui/PracticeScreen.tsx"), "utf8");
    assert(/label: "Easy"/.test(practice), "AI depth 1 is labeled Easy");
    assert(/label: "Standard"/.test(practice), "AI depth 2 is labeled Standard");
    assert(/label: "Expert"/.test(practice), "AI depth 3 is labeled Expert");
    assert(/AI DIFFICULTY/.test(practice), "difficulty group has a plain-language heading");

    const mainMenu = fs.readFileSync(path.join(root, "src/ui/MainMenu.tsx"), "utf8");
    assert(/PLAY THE COMPUTER/.test(mainMenu), "main menu exposes CPU play as a primary action");
    assert(/Start a solo game/.test(mainMenu), "main menu names the solo CPU action plainly");
    assert(/JOIN WITH CODE/.test(mainMenu), "main menu exposes room-code joining plainly");
    assert(
        /onlineReady \? "ENTER CODE" : "OPEN IN RUN TO JOIN"/.test(mainMenu),
        "join field explains preview availability",
    );
    assert(/visible\.length === 1 \? "board" : "boards"/.test(mainMenu), "saved-board count has correct grammar");
    assert(/data-testid="join-code-input"/.test(mainMenu), "room-code join has an addressable text field");
    assert(/mode: "join"/.test(mainMenu), "room-code submit uses the multiplayer join path");
    assert(/\^\[A-Z0-9\]\{6\}\$/.test(mainMenu), "room-code join accepts exactly the SDK's 6 characters");
    assert(!/profileName\.slice/.test(mainMenu), "main menu has no unexplained profile initial");
    assert(/Remove this card/.test(mainMenu), "every saved board exposes a plain-language remove action");
    assert(/End match/.test(mainMenu), "active saved boards expose an end-match action");
    assert(/inbox-match-manage/.test(mainMenu), "saved-board management is directly discoverable");
    assert(/data-match-key=/.test(mainMenu), "saved-board controls remain uniquely addressable");

    const css = fs.readFileSync(path.join(root, "src/styles/app.css"), "utf8");
    const app = fs.readFileSync(path.join(root, "src/ui/App.tsx"), "utf8");
    assert(
        /\.menu-shader\s*\{/.test(css) && /<MenuShaderBackground/.test(app),
        "menus mount a dedicated checkerboard shader layer",
    );
    assert(
        /\.challenge-orbit\s*>\s*svg\s*\{[^}]*width:\s*38px[^}]*height:\s*38px/.test(css),
        "challenge knight uses an explicitly sized vector icon",
    );
    assert(
        /\.inbox-list:not\(\.empty\) \.inbox-match-stack\s*\{[^}]*grid-auto-rows:\s*66px/.test(css),
        "one saved board stays a compact row instead of stretching",
    );

    const hud = fs.readFileSync(path.join(root, "src/ui/Hud.tsx"), "utf8");
    assert(/headline: "YOUR TURN"/.test(hud), "HUD explicitly identifies the player's turn");
    assert(/OPPONENT'S TURN/.test(hud), "HUD explicitly identifies the opponent's turn");
    assert(/PASS & PLAY/.test(hud) && /TO MOVE/.test(hud), "local HUD names the moving side");
    assert(/const isYourTurn =/.test(hud), "HUD derives the local player's active turn");
    assert(/helper-bar\$\{isYourTurn \? " your-turn"/.test(hud), "helper rail marks the local player's turn");
    assert(/className="reaction-actions"/.test(hud), "reactions have a dedicated responsive action grid");
    assert(/Send a friendly chess phrase/.test(hud), "reaction UI explains its purpose");
    assert(/className="connection-card/.test(hud), "lost connections show a dedicated recovery card");
    assert(/Your board is safe/.test(hud), "reconnect copy reassures the player that progress is preserved");
    assert(!/SHARE INVITE/.test(hud), "waiting board has no broken share-invite button");

    const challenge = fs.readFileSync(path.join(root, "src/ui/ChallengeScreen.tsx"), "utf8");
    assert(/CREATE BOARD/.test(challenge), "friend challenge creates a board without a broken share action");
    assert(!/SHARE INVITE/.test(challenge), "challenge setup has no broken share-invite action");
    assert(
        /Friend games aren’t connected here/.test(challenge),
        "offline preview explains why friend games are unavailable",
    );
    assert(/isNew: true/.test(challenge), "a new friend board is not persisted before the server accepts it");

    const lounge = fs.readFileSync(path.join(root, "src/ui/LoungeScreen.tsx"), "utf8");
    assert(/PRODUCT_IDS\.map/.test(lounge), "Lounge renders every configured Run Bits product");
    assert(/className="shop-card"/.test(lounge), "Lounge exposes real catalog cards");
    assert(/view\.priceLabel/.test(lounge), "catalog cards display the host-resolved Run Bits price");
    assert(/purchaseProduct\(productId\)/.test(lounge), "catalog cards use the verified Shop checkout path");

    const appRouter = fs.readFileSync(path.join(root, "src/ui/App.tsx"), "utf8");
    assert(
        /setTimeout\(\(\) => store\.patch\(\{ toast: null \}\), 4_000\)/.test(appRouter),
        "toasts dismiss automatically",
    );

    const menuLayout = fs.readFileSync(path.join(root, "src/ui/MenuScreenLayout.tsx"), "utf8");
    assert(
        /menuScreen: backScreen, toast: null/.test(menuLayout),
        "back navigation clears the previous screen's toast",
    );

    const preview = fs.readFileSync(path.join(root, "src/dev/preview.ts"), "utf8");
    assert(!/SSNS7T/.test(preview), "development previews do not expose a fake joinable room code");

    assert(/\.helper-bar\.your-turn::before/.test(css), "local turn paints a gold divider above helper controls");
    assert(
        /data-reduced-motion="true"[\s\S]*?\.helper-bar\.your-turn::before/.test(css),
        "turn divider settles for reduced motion",
    );
    assert(
        /\.online-banner\s*\{[^}]*position:\s*relative/.test(css),
        "portrait room status stays in flow below the HUD",
    );
    assert(
        /@media \(orientation:\s*landscape\)[\s\S]*?\.online-banner\s*\{[^}]*top:\s*calc\(var\(--box-y\) \+ var\(--rail-hud\)/.test(
            css,
        ),
        "landscape room status starts below the reserved HUD rail",
    );
    assert(
        /@media \(orientation:\s*landscape\)[\s\S]*?--box-w:\s*100vw/.test(css),
        "landscape uses the full host content viewport",
    );
    assert(
        /orientation:\s*landscape\) and \(max-width:\s*760px\)[\s\S]*?\.inbox-menu/.test(css),
        "narrow host landscape has a dedicated menu layout",
    );
    assert(/!waitingOnline/.test(hud), "waiting room details render once, inside the primary card");

    const scene = fs.readFileSync(path.join(root, "src/game/scene/ChessScene.ts"), "utf8");
    assert(!/g\.rect\(0, 0, w, Math\.max\(90/.test(scene), "gameplay backdrop has no hard top band");
}

if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
}
console.log("\ntest-ui-layout: all checks passed");
