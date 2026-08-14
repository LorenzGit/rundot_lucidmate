# LUCIDMATE v1.0.17 release evidence

Date: 2026-08-14
Reviewer: Codex
Target: RUN production, public tag, game `RuE1GRalg9GejuPtJD6t`

| Gate | Result | Evidence |
| --- | --- | --- |
| Design | PASS | `README.md`; chess simulation and UI contract tests. |
| FTUE and accessibility | PASS | `npm run visual-qa`: 14 surfaces × 5 viewports; at least 10px text, overflow, and console gates. |
| Save and progression | PASS | Platform-system, correspondence reconnect, resize, end/cancel/remove, and reload tests. |
| Monetization | PASS | Active RB cosmetics in `rundot/shop.config.json`; rewarded and interstitial placements in LiveOps; checkout/recovery tests fail closed. No purchase was executed. |
| LiveOps | PASS | Typed defaults, caps, cooldowns, and fail-closed product/placement gates in `rundot/liveops.config.json`. |
| Visual quality | PASS | Original 512×512 JPEG; fresh ViewDeck iPhone portrait/landscape reaction captures; 88-screenshot visual matrix. |
| Audio and haptics | PASS | Persisted controls, lifecycle/audio, and capability-gated haptic contracts; physical haptic feel was not re-tested. |
| Assets and catalog | PASS | Relative production assets, embedded and bundled build verification, catalog metadata read-back. |
| Localization | PASS | Centralized player copy and shared number-formatting assertions. |
| Reliability | PASS | Readiness audit 10/10; format, lint, tests, public audit, typecheck, and both builds pass. |
| Reproducible QA | PASS | Semantic browser contract, multiplayer browser flows, complete visual matrix, and ViewDeck reports with no page errors. |
| Multiplayer / authority | PASS | Three two-client flows; server-authoritative moves; reconnect/resize recovery; one reaction on the current player's turn, hidden until their next turn. Protected recipes dispatch move/reaction push events without rolling back gameplay on delivery failure. |
| Analytics | PASS | Core, retention, multiplayer, and monetization event contracts; analytics remain non-authoritative. |
| Safety and support | PASS | Notification consent, exact-board routing, stable event keys, recoverable failures, and removable saved boards. |
| Release operations | PASS | Public `v1.0.17` verified at `https://w.run/lonu/lucidmate` with server config `fRFXJsZJBODIzjeKl3XY`. |

## Visual integrity gate

Screenshots:

- `/tmp/viewdeck-qa.lucidmate.NU3l7P/reactions-portrait.png`
- `/tmp/viewdeck-qa.lucidmate.NU3l7P/reactions-landscape.png`

Candidate fail reviewed: ViewDeck reported the SDK's intentional 1×1 hidden
button at `(-1000, -1000)` as outside the viewport. It is absent from both
captures and is not player-facing UI. No candidate visual defect remained.

1. UI overlap: **No** — board, HUD, status pill, divider, and reaction controls have distinct bounds in both orientations.
2. Text issues: **No** — every reaction label and status glyph is complete and contained.
3. UI covering art: **No** — controls stay outside the board and do not obscure pieces.
4. Art too small: **No** — all procedural pieces and reaction symbols remain identifiable.
5. Malformed icons: **No** — gear and four reaction icons have complete strokes and consistent containers.
6. Style drift: **No** — cream, magenta, gold, rounded panels, and cosmic backdrop match the established casual-cosmic direction.
7. Misalignment: **No** — portrait reaction buttons share one baseline; landscape buttons use an even two-column grid inside the safe area.
8. Stretched imagery: **No** — procedural board, pieces, icons, and background geometry retain their intended proportions.

## Ship decision

**Shipped.** The pre-Venus-#3849 path sends plain remote push for accepted
moves and reactions. Durable RUN inbox rows, foreground toasts, and rich media
remain dependent on that Venus work. End-to-end APNs delivery still requires a
two-identity physical-device test with the receiving RUN app backgrounded or
closed.
