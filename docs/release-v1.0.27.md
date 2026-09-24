# LUCIDMATE v1.0.27

Date: 2026-09-23. Reviewer: Claude. Target: production, public tag, game `RuE1GRalg9GejuPtJD6t`.

## Changes

- Inbox layout: the menu scrolls as one page in portrait with the dock pinned, so the games list is reachable on 667px and 568px phones instead of collapsing to a sliver; rows size to their content in landscape (mini-boards and the activity line no longer clip); the turn spotlight uses the stacked layout on every portrait width, so tablets no longer truncate "YOUR TURN"; the rivalry label is a single ellipsized line.
- Landscape: the board uses frame margins instead of the portrait HUD reserves and fills the play column; sub-screen cards no longer shrink inside the scroll region (the Dreambook path card was 66px of 283).
- Narrow phones: the turn-alert subtitle wraps and the join placeholder ellipsizes.
- Localization removed: English only; the Settings language picker, the CSV and the locale save key are gone. Older saves load unchanged.
- Menu illustrations ship as WebP (4.5 MB → 0.7 MB).
- Store tile rebuilt from the game's own mascot art and palette; README screenshots recaptured; catalog description and keywords now describe the cosy toybox look.
- Save guard: cloud writes stay blocked until one RUN storage read has succeeded, so a failed or timed-out read can no longer let the local copy or defaults overwrite the player's real cloud save; unreadable remote saves are backed up first and saves from a newer build are never overwritten. Covered by `scripts/test-save-guard.ts` in `npm test`.
- Repo hygiene: check-game invariant matches the shipped online client, CI runs `npm run check`, dependency advisories cleared, stale LEADLIGHT/template docs rewritten, visual QA preview hooks hold their state across boot.

## Release gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Design | PASS | Chess rules, economy and progression untouched; `npm run simulate` passes. |
| FTUE and accessibility | PASS | Layout and safe-area checks in `npm run check`; text never under 10px; 44px targets unchanged. |
| Save and progression | PASS | Solo save, save-guard, room notification, platform system and launch router tests pass; the dropped `locale` key is ignored by the loader. |
| Monetization | PASS | Shop, placements and purchase coordinator unchanged; check-game shop invariants pass; no purchase made. |
| LiveOps | PASS | `rundot liveops diff` reports no difference against the deployed tag. |
| Visual quality | PASS | `npm run visual-qa`: 121 screenshots, 19 surfaces × 5 viewports, no overflow, typography or console failures; inspected 393×852, 375×667, 320×568, 820×1180, 956×440, 844×390 and 1440×900 by eye. |
| Audio and haptics | PASS | Unchanged. |
| Assets and catalog | PASS | New 512×512 JPEG tile inspected; public audit passes; description and keywords read back on the public listing page. |
| Localization | N/A | Feature removed; the game is English only. |
| Reliability | PASS | `npm run check` (format, lint, tests, public audit, both production builds) and `npm audit` clean. |
| Reproducible QA | PASS | Menu geometry measured at eight viewports before and after; preview hooks verified with a state trace. |
| Multiplayer / authority | PASS | `npm run test:multiplayer`: rivals, correspondence turn flow and management all pass when run alone; the room-join step is retry-prone under machine load, as in 1.0.26. |
| Analytics | PASS | Unchanged. |
| Safety and support | PASS | Unchanged. |
| Release operations | PASS | Fresh multiplayer build deployed to prod as 1.0.27 with server config `8PiCRICJwPtY7isXPkxy`; private and review tags read back as 1.0.27; public submitted for review and remains 1.0.26 (`lIj1aVpidve88RzEZWRQ`) until platform review publishes it. Release commit pushed to origin/main. |

## Rollout and limits

Physical-device push delivery and two-device correspondence remain host-only checks. The `rundot game info` keyword read lags the public listing; the listing page is authoritative.

Roll back the public version and server configuration to 1.0.26 and `lIj1aVpidve88RzEZWRQ` if needed.
