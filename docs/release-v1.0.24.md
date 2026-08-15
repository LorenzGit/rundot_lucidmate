# LUCIDMATE v1.0.24 release evidence

Date: 2026-08-15
Reviewer: Codex
Target: RUN production, public tag, game `RuE1GRalg9GejuPtJD6t`

## Changelog

- Unifies the lobby, secondary screens, Store, and gameplay HUD around the
  green casual visual system.
- Adds original rookbot and chess-friends illustrations with aspect-ratio-safe
  presentation across portrait and landscape.
- Promotes waiting turns in the lobby, keeps solo CPU play prominent, and
  removes the redundant Home dock destination.
- Keeps SDK 5.24 move, reaction, challenge, and game-over notification recipes
  on the released push-only schema while preserving exact-board launch routing.
- Improves saved-board recovery, reaction-per-turn behavior, room resizing,
  haptics, and responsive multiplayer UI.

## Release gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Version | PASS | Package and first-screen version are `1.0.24`. |
| Visual quality | PASS | ViewDeck iPhone 16 Pro portrait, landscape, Store, and gameplay captures in `/tmp/viewdeck-lucidmate-runship.SEwLlX`. |
| UI integrity | PASS | No remaining overlap, clipping, malformed icon, style drift, misalignment, or stretched-image defects. |
| Reliability | PASS | `npm run check`; multiplayer and bundled production builds; readiness audit. |
| Multiplayer | PASS | Server-authoritative move/reaction tests, exact-board routing, reconnect and resize contracts. |
| Monetization | PASS | Active cosmetic Shop catalog and fail-closed purchase recovery; no purchase executed. |
| Audio and haptics | PASS | Muted hidden audio activity verified; capability-gated haptic wiring and persisted controls tested. |
| Release operations | PASS | RUN platform v1.0.19 is public at `https://w.run/lonu/lucidmate`; server config `mv4pCp2cYe4XAX02fY2Z` read back after publish. |

## Host-only follow-up

Physical-device push delivery still depends on RUN/APNs delivery and requires a
real two-identity backgrounded-device test. This release does not claim that a
local or ViewDeck run can prove operating-system push delivery.

## Ship decision

**Ship.** The release-critical automated, visual, responsive, and readiness
gates pass. The physical push-delivery check remains explicit host evidence,
not a blocker for the UI and recovery release.
