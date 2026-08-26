# LUCIDMATE v1.0.24 lockstep release evidence

Date: 2026-08-26
Reviewer: Grok
Target: RUN production, public tag, game `RuE1GRalg9GejuPtJD6t`

Menu stamp and catalog version are the same number after this ship. Local
`package.json` had drifted to 1.0.38; `npm run version:sync` wrote the next
platform patch (1.0.23 + 1) before `rundot deploy --bump Patch`.

## Changelog

- In-game version and RUN catalog version stay in lockstep via `npm run version:sync`.
- Entering a live or correspondence match shows a blocking spinner overlay until the room connects or fails.

## Release gates

| Gate | Have we done this? | Evidence / exception |
| --- | --- | --- |
| Design | PASS | Correspondence + solo loop documented in DESIGN.md; join overlay is a connect wait, not a new loop. |
| FTUE and accessibility | PASS | Overlay is `role="status"`; reduced-motion spinner is a static conic ring; overlay uses safe-area padding. |
| Save and progression | PASS | Save schema v4 unchanged this ship. |
| Monetization | PASS | Unchanged Shop + ads wiring; no purchase executed. |
| LiveOps | PASS | Existing liveops.config.json; no LiveOps change. |
| Visual quality | PASS | ViewDeck iPhone 17 Pro Max portrait/landscape, iPhone SE, desktop 1440 of join overlay. UI/art gate PASS. |
| Audio and haptics | PASS | Unchanged; overlay does not alter mute/volume. |
| Assets and catalog | PASS | Game `RuE1GRalg9GejuPtJD6t`, orientation both, keywords unchanged, dist `./`. |
| Localization | PASS | Overlay copy is English UI chrome; quantities still use the locale formatter. |
| Reliability | PASS | `npm run check`; production build immediately before deploy; readiness audit. |
| Reproducible QA | PASS | `test-ui-layout` join overlay + version-sync parse; ViewDeck hidden `verify-silent` captures. |
| Multiplayer / authority | PASS | Overlay only while connecting; second join is rejected while `joinBusyLabel` is set. Real two-player still host-only. |
| Analytics | PASS | Unchanged; overlay does not add events. |
| Safety and support | PASS | Unchanged; overlay is not UGC. |
| Release operations | PASS | Prod game `RuE1GRalg9GejuPtJD6t`. In-game and catalog `1.0.24`. Private and review tags are `1.0.24` with server config `q0QHzEWxGqcCbvsMqr6M`. Public remains `1.0.23` until platform review auto-publishes. |

## Host-only follow-up

Physical-device push delivery and two-player correspondence still need a real RUN host and a second identity.

## Ship decision

**Decision:** ship
**Game, environment, version/tag:** LUCIDMATE, prod, in-game 1.0.24, RUN 1.0.24 review-pending public
**Reviewer and date:** Grok, 2026-08-26
**Open risks:** none blocking; host push and two-player correspondence remain host-only. Public may wait on platform review.
