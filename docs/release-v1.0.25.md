# LUCIDMATE v1.0.25 release evidence

Date: 2026-08-26
Reviewer: Grok
Target: RUN production, public tag, game `RuE1GRalg9GejuPtJD6t`

## Changelog

- Turn alerts say who moved where and ask the player to finish their turn.
- Tapping a turn alert opens that correspondence board at boot and while Lucidmate is already open.
- The alert uses the catalog JPEG as `iconUrl`.

## Release gates

| Gate | Have we done this? | Evidence / exception |
| --- | --- | --- |
| Design | PASS | Correspondence loop unchanged; notification is the return path into a waiting turn. |
| FTUE and accessibility | PASS | Overlay and launch path reuse existing join spinner and safe-area chrome. |
| Save and progression | PASS | Save schema v4 unchanged. |
| Monetization | PASS | Unchanged Shop + ads; no purchase executed. |
| LiveOps | PASS | Existing liveops.config.json; no LiveOps change. |
| Visual quality | PASS | No in-game visual surface change this ship; catalog thumbnail unchanged. |
| Audio and haptics | PASS | Unchanged. |
| Assets and catalog | PASS | Game `RuE1GRalg9GejuPtJD6t`, orientation both, keywords unchanged. |
| Localization | PASS | Inbox template English; quantities still use the locale formatter. |
| Reliability | PASS | `npm run check`; production build immediately before deploy; readiness audit. |
| Reproducible QA | PASS | Room-notification tests for copy, matchKey payload, iconUrl; launch-param tests; boot listens for live notification params. |
| Multiplayer / authority | PASS | Room still sends the move; client opens the named `matchKey`. Real two-player still host-only. |
| Analytics | PASS | Existing `correspondence_link_opened` on a tap that actually opens a board. |
| Safety and support | PASS | Username already in alerts; destination square is algebraic, not free text. |
| Release operations | PASS | Prod game `RuE1GRalg9GejuPtJD6t`. In-game and catalog `1.0.25`. Private and review tags are `1.0.25` with server config `75sCFS2TlxmrthHcXSOC`. Public remains `1.0.24` until platform review auto-publishes. |

## Host-only follow-up

Physical-device push delivery and two-player correspondence still need a real RUN host and a second identity. Public may wait on platform review.

## Ship decision

**Decision:** ship
**Game, environment, version/tag:** LUCIDMATE, prod, in-game 1.0.25, RUN 1.0.25 review-pending public
**Reviewer and date:** Grok, 2026-08-26
**Open risks:** none blocking; host push and two-player correspondence remain host-only.
