# LUCIDMATE v1.0.26

Date: 2026-09-16. Reviewer: Codex. Target: production, public tag, game `RuE1GRalg9GejuPtJD6t`.

## Changes

- Every correspondence turn attempts notification delivery, including when the opponent's socket remains connected.
- Recipe and direct delivery use the same stable `turn_N` ID, including overlapping requests. The companion Venus change scopes deduplication to game, room, template, recipient, and event.
- Cold launches read `context.launchParams`; notification taps during boot or another room join stay queued. The newest waiting destination wins.
- Challenge, reaction, and rematch recipes carry room-event identity. Authoritative multiplayer readiness uses the SDK's public mock status.
- Version sync accepts explicit CLI environment and game arguments, avoiding the operator's unrelated default environment.

## Release gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Design | PASS | Existing chess rules and progression unchanged; repeated real local multiplayer turns exercised. |
| FTUE and accessibility | PASS | Existing controls unchanged; layout and safe-area checks in `npm run check`. |
| Save and progression | PASS | Existing save tests, multiplayer reconnect, cold reload, and exact-board recovery passed; schema unchanged. |
| Monetization | PASS | Existing Shop and ads unchanged; purchase coordinator recovery tests passed; no purchase made. |
| LiveOps | PASS | Existing defaults unchanged. |
| Visual quality | PASS | Inspected native WebKit board, menu, cold-launch screenshots and replay video; new version stamp checked separately. Existing compact opponent/pace truncation remains unchanged. |
| Audio and haptics | PASS | Existing behavior unchanged; hidden native capture verified muted audio. Physical haptics not retested for this routing patch. |
| Assets and catalog | PASS | Readiness audit verified 512x512 JPEG, configuration, assets; public asset and build checks passed. |
| Localization | PASS | Player-visible copy unchanged; launch parsing keeps each source intact. |
| Reliability | PASS | `npm run check`, final production build, and advisory audit with 10 passes and no warnings/failures. |
| Reproducible QA | PASS | `scripts/qa-launch-deeplink.mjs`, launch-router tests, phone-sized ViewDeck flat/nested-payload replay. |
| Multiplayer / authority | PASS | Room tests include connected recipients and overlapping moves. Browser rivals, turn-flow, and match-management checks passed; management needed one retry after a detached-button timeout. |
| Analytics | PASS | Existing notification-open events retained. |
| Safety and support | PASS | Existing notification permission and server policy remain enforced. No player data changed. |
| Release operations | PASS | Fresh multiplayer build deployed to prod. Public, private, and approved review tags read back as 1.0.26 with server config `lIj1aVpidve88RzEZWRQ`. |

Evidence: `/tmp/lucidmate-notifications-native/verification.md`, `notification.mp4`, `43-cold-launch.png`, `release-1.0.26-menu.png`; release logs `/tmp/lucidmate-runship-*.log`.

## Rollout and limits

This client release can ship before Venus, but distinct moves may still be suppressed until the RUN-210 broker fix reaches production. Foreground opponents may now receive move alerts. Physical APNs/FCM delivery and real-host two-device background/foreground taps remain a release follow-up, not a claimed local test result.

The user authorized RUNSHIP after these remaining deployment and physical-device limits were disclosed. No major/fan notification release is requested. Roll back the public version and server configuration to 1.0.25 and `75sCFS2TlxmrthHcXSOC` if needed.

Decision: ship this routing and notification-attempt patch; complete the backend release and physical-device verification separately.
