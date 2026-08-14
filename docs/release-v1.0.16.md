# LUCIDMATE v1.0.16 release evidence

Date: 2026-08-14
Reviewer: Codex
Target: RUN production, public tag, game `RuE1GRalg9GejuPtJD6t`

| Gate | Result | Evidence |
| --- | --- | --- |
| Design | PASS | `README.md`; chess simulation and UI contract tests. |
| FTUE and accessibility | PASS | `npm run visual-qa`: 14 surfaces × 5 viewports; ≥10px text, overflow and console gates. |
| Save and progression | PASS | platform-system, correspondence reconnect, resize, end/cancel/remove, and reload tests. |
| Monetization | PASS | active RB cosmetics in `rundot/shop.config.json`; rewarded and interstitial placements in LiveOps; checkout/recovery tests fail closed. No purchase was executed. |
| LiveOps | PASS | typed defaults, caps, cooldowns, and fail-closed product/placement gates in `rundot/liveops.config.json`. |
| Visual quality | PASS | original 512×512 JPEG; fresh ViewDeck iPhone capture; full visual matrix. |
| Audio and haptics | PASS | persisted controls, lifecycle/audio and capability-gated haptic contracts; physical haptic feel was not re-tested in this release. |
| Assets and catalog | PASS | relative production assets, embedded and bundled build verification, catalog metadata read-back. |
| Localization | PASS | centralized localized player copy and shared number formatting assertions. |
| Reliability | PASS | readiness audit 10/10; format, lint, tests, public audit, typecheck, and both builds pass. |
| Reproducible QA | PASS | semantic browser contract, 88 visual screenshots, and ViewDeck report with zero layout/page errors or failed requests. |
| Multiplayer / authority | PASS | three two-client flows; invited player is White and moves first; reconnect and resize restore correctly. Accepted moves await the room notification broker; broker failure preserves the move; departed recipients use the any-player recipe fallback. |
| Analytics | PASS | core, retention, multiplayer, and monetization event contracts; analytics remain non-authoritative. |
| Safety and support | PASS | notification consent, exact-board routing data, recoverable failures, and removable saved boards. |
| Release operations | PASS | public `v1.0.16` verified at `https://w.run/lonu/lucidmate` with server config `Mwif7SH67MdOpr8w6gXz`. |

## Visual integrity gate

Screenshot: `/tmp/lucidmate-v1016-viewdeck/main.png`

Candidate fails reviewed: muted placeholder text in the empty join field and
the tall empty-board panel. The placeholder is intentionally disabled until a
code is entered, remains legible, and the panel contains centered empty-state
art and guidance rather than unstructured dead space.

1. UI overlap: **No** — primary card, friend/rival cards, code row, empty state, Daily Dream, and dock have distinct bounds.
2. Text issues: **No** — every visible glyph is complete; titles and supporting copy remain inside their containers.
3. UI covering art: **No** — the checkerboard is decorative and the empty-state mark is unobscured.
4. Art too small: **No** — CPU, friend, rival, empty-state, Daily Dream, and dock icons are identifiable at the captured size.
5. Malformed icons: **No** — all captured icons have complete strokes and containers.
6. Style drift: **No** — teal, gold, cream, rounded panels, and the animated checkerboard treatment match the established casual-cosmic direction.
7. Misalignment: **No** — sibling cards share top/bottom baselines, parallel gaps are even, and dock cells are equal-sized.
8. Stretched imagery: **No** — the procedural checkerboard, orb, and vector icons retain their intended proportions.

## Ship decision

**Shipped.** Live APNs and RUN inbox delivery after a real opponent move still
requires two RUN identities and a receiving iPhone with the app closed for the
final host test. The documented server notification path is now public.
