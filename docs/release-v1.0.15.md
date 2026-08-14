# LUCIDMATE v1.0.15 release evidence

Date: 2026-08-14
Reviewer: Codex
Target: RUN production, public tag, game `RuE1GRalg9GejuPtJD6t`

| Gate | Result | Evidence |
| --- | --- | --- |
| Design | PASS | `README.md`; chess simulation and UI contract tests. |
| FTUE and accessibility | PASS | `npm run visual-qa`: 14 surfaces × 5 viewports; ≥10px text, overflow and console gates. |
| Save and progression | PASS | platform-system, correspondence reconnect, end/cancel/remove, and reload tests. |
| Monetization | PASS | active RB cosmetics in `rundot/shop.config.json`; rewarded and interstitial placements in LiveOps; checkout/recovery tests fail closed. No purchase was executed. |
| LiveOps | PASS | typed defaults, caps, cooldowns, and fail-closed product/placement gates in `rundot/liveops.config.json`. |
| Visual quality | PASS | original 512×512 JPEG; fresh ViewDeck portrait/landscape captures; full visual matrix. |
| Audio and haptics | PASS | persisted controls, lifecycle/audio and capability-gated haptic contracts; physical haptic feel was not re-tested in this release. |
| Assets and catalog | PASS | relative production assets, embedded and bundled build verification, catalog metadata read-back. |
| Localization | PASS | centralized localized player copy and shared number formatting assertions. |
| Reliability | PASS | readiness audit 10/10; format, lint, tests, public audit, typecheck, and both builds pass. |
| Reproducible QA | PASS | semantic browser contract, 88 visual screenshots, and hidden ViewDeck reports with zero layout/page errors. |
| Multiplayer / authority | PASS | three two-client flows; invalid moves notify nobody; accepted moves await the broker; broker failure preserves the move. |
| Analytics | PASS | core, retention, multiplayer, and monetization event contracts; analytics remain non-authoritative. |
| Safety and support | PASS | notification consent, minimal routed payload, recoverable failures, and removable saved boards. |
| Release operations | PASS | local `v1.0.15`, game/build/config/thumbnail/orientation/keywords confirmed; fresh build and remote read-back required immediately around deploy. |

## Visual integrity gate

Candidate fail reviewed: the lower landscape board row is partially visible at
the edge of its intentional secondary scroll region; primary actions, alert
setup, Daily Dream, and navigation remain fully visible.

1. UI overlap: **No** — sibling cards and controls have distinct bounds.
2. Text issues: **No** — visible glyphs are complete and the automated floor is 10px.
3. UI covering art: **No** — the checkerboard is decorative and no focal subject is obscured.
4. Art too small: **No** — board marks, icons, and the Daily Dream orb remain identifiable.
5. Malformed icons: **No** — all captured icons have complete strokes and containers.
6. Style drift: **No** — teal, gold, cream, rounded panels, and checkerboard treatment are consistent.
7. Misalignment: **No** — portrait and landscape cards share baselines, equal gaps, and consistent sizes.
8. Stretched imagery: **No** — procedural geometry and checkerboard cells retain their intended proportions.

## Ship decision

**Ship.** Live APNs/inbox delivery after an opponent move still requires the
deployed build, two RUN identities, and the receiving phone closed; this release
exists to enable that final host test.
