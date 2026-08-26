# LUCIDMATE v1.0.37 release evidence

Date: 2026-08-26
Reviewer: Grok
Target: RUN production, public tag, game `RuE1GRalg9GejuPtJD6t`

## Changelog

- Correspondence timeout and resign no longer present as checkmate.
- Waiting, results, and inbox overlays stay inside portrait, landscape, and desktop frames.
- Unfinished solo and pass-and-play boards save; home can resume or discard them.
- MENU on a table game asks to save and leave, end the game, or keep playing.

## Release gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Version | PASS | Package and first-screen version are `1.0.37`. |
| Visual quality | PASS | ViewDeck iPhone 17 Pro Max portrait/landscape and desktop 1440 captures of waiting, timeout, continue, and leave sheet. |
| UI integrity | PASS | Wait overlay centering, timeout copy, continue card grid, leave sheet buttons. |
| Reliability | PASS | `npm run check`; multiplayer and bundled production builds; readiness audit 10 pass / 0 fail. |
| Save | PASS | Save schema v4 with solo board sanitizer and resume/abandon tests. |
| Multiplayer | PASS | Existing room/notification tests; timeout reason threaded from ChessRoom through results. |
| Monetization | PASS | Unchanged Shop + ads wiring; no purchase executed. |
| Release operations | PASS | Prod game `RuE1GRalg9GejuPtJD6t`. RUN version `1.0.23` is on private and review with server config `4jysN675ZWZWoOqJrBrA`. Public remains `1.0.22` until platform review auto-publishes. |

## Host-only follow-up

Physical-device push delivery and two-player correspondence still need a real RUN host and a second identity.

## Ship decision

**Decision:** ship
**Game, environment, version/tag:** LUCIDMATE, prod, in-game 1.0.37, RUN 1.0.23 review-pending public
**Reviewer and date:** Grok, 2026-08-26
**Open risks:** none blocking; host push and two-player correspondence remain host-only.
