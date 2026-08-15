# LUCIDMATE v1.0.18 release evidence

Date: 2026-08-14
Reviewer: Codex
Target: RUN production, public tag, game `RuE1GRalg9GejuPtJD6t`

| Gate | Result | Evidence |
| --- | --- | --- |
| Design | PASS | `README.md`; chess simulation and UI contract tests. |
| FTUE and accessibility | PASS | `npm run visual-qa`: 15 surfaces × 5 viewports; typography, overflow, and console gates. |
| Save and progression | PASS | Platform-system, correspondence reconnect, resize, end/cancel/remove, and reload tests. |
| Monetization | PASS | Active RB cosmetics in `rundot/shop.config.json`; rewarded and interstitial placements in LiveOps; checkout/recovery tests fail closed. No purchase was executed. |
| LiveOps | PASS | Typed defaults, caps, cooldowns, and fail-closed product/placement gates in `rundot/liveops.config.json`. |
| Visual quality | PASS | Original 512×512 JPEG; fresh ViewDeck iPhone reconnect capture; 93-screenshot visual matrix. |
| Audio and haptics | PASS | Persisted controls, lifecycle/audio, and capability-gated haptic contracts; physical haptic feel was not re-tested. |
| Assets and catalog | PASS | Relative production assets, embedded and bundled build verification, catalog metadata read-back. |
| Localization | PASS | Centralized player copy and shared number-formatting assertions. |
| Reliability | PASS | Readiness audit 10/10; format, lint, tests, public audit, typecheck, and both builds pass. |
| Reproducible QA | PASS | Semantic browser contract, multiplayer browser flows, complete visual matrix, and ViewDeck report with no page errors. |
| Multiplayer / authority | PASS | Three two-client flows; server-authoritative moves; invite-code join; reconnect/resize recovery; one reaction per turn. The notification contract covers native room delivery and protected offline fallback. |
| Analytics | PASS | Core, retention, multiplayer, and monetization event contracts; analytics remain non-authoritative. |
| Safety and support | PASS | Notification consent, exact-board routing, stable event keys, recoverable failures, redacted session errors, and removable saved boards. |
| Release operations | PASS | Public `v1.0.18` verified at `https://w.run/lonu/lucidmate` with approved server config `0Xl82OaclfT6o2zUkvBj`. |

## Visual integrity gate

Screenshot: `/tmp/viewdeck-qa.lucidmate.9cq5FS/reconnecting-seamless.png`

Candidate fail reviewed: ViewDeck reported the SDK's intentional 1×1 hidden
button at `(-1000, -1000)` as outside the viewport. It is absent from the
capture and is not player-facing UI. No candidate visual defect remained.

1. UI overlap: **No** — board, HUD, status, and controls have distinct bounds.
2. Text issues: **No** — status text and glyphs are complete and contained.
3. UI covering art: **No** — reconnect no longer places a modal over the board.
4. Art too small: **No** — all procedural pieces remain identifiable.
5. Malformed icons: **No** — gear and chess-piece silhouettes have complete strokes.
6. Style drift: **No** — cream, magenta, gold, and cosmic backdrop match the established direction.
7. Misalignment: **No** — HUD controls share a baseline and board gutters are equal.
8. Stretched imagery: **No** — procedural board, pieces, icons, and background geometry retain their proportions.

## Ship decision

**Shipped.** v1.0.18 fixes the invalid protected notification recipe schema,
adds native room notification delivery with a protected offline fallback, and
replaces duplicate-session failures with bounded automatic saved-board recovery.
The settings notification test previously proved the RUN-to-APNs path; a real
move/reaction delivery still requires a two-identity physical-device check.

## Post-release finding

The required two-identity device test failed. The offline fallback included
`roomNotification`, a contract that is not present in released SDK 5.24 and is
part of the unmerged Venus #3849 work. The next patch removes those future-only
fields, keeps the fallback on the documented push-only recipe contract, and
normalizes SDK 5.24's nested notification payload for exact-board reopening.
