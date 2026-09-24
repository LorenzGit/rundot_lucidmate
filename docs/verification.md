# Verification workflow

Use the smallest check that can reliably detect the failure a change could
introduce, then keep the release gate. Report what changed, what was run, which
viewports or host conditions were exercised, and what remains unverified.

| Change | Minimum reliable check |
| --- | --- |
| Copy, spacing, colour, or one-screen layout | `npm run visual-qa` and read the PNGs in `tmp/visual-qa` |
| Chess rules, move generation, or results | `npm run simulate` |
| Board geometry, HUD reserves, or safe areas | `npm run test:ui` and `node scripts/check-safe-area.ts` |
| Menu, inbox, rivals, or correspondence flows | `npm run dev:multiplayer` in one terminal, then `npm run test:multiplayer` |
| Save schema, notifications, or launch routing | `npm test` (solo save, room notifications, platform systems, launch router) |
| Shop, entitlements, ads, or trusted time | `npm run dev:playground` against a real host — the local build cannot prove these |
| Renderer, build, or dependency change | `npm run check` (both production builds) |
| Store tile | `node scripts/make-thumbnail.mjs`, then look at `public/thumbnail.jpg` |
| README screenshots | `node scripts/capture-screenshots.mjs` |
| Release preparation | `npm run check`, fresh visual evidence, and a release note under `docs/` |

## What each command actually proves

- **`npm run simulate`** — the rules, headless: castling, en passant, promotion,
  check, checkmate, stalemate and the 50-move draw. A wrong result still looks
  like a plausible board on screen, so only this catches it.
- **`npm run test:ui`** — the shipped `computeBoardLayout` constants in both
  orientations, the helper-bar and HUD CSS contracts, and the player-facing
  identity checks (no template or other-game copy left in the UI).
- **`npm run visual-qa`** — every menu and board state at five viewports, driven
  through the `__LUCIDMATE_QA__` browser contract. It fails on any page or
  console error, horizontal overflow, document scroll, or text under 10px.
- **`npm run test:multiplayer`** — two real browser tabs against the local
  authoritative room server: challenges, invite codes, reconnects, reactions,
  rematches and board management.
- **`npm run check`** — format, lint, `npm test`, the public-repository audit,
  and both production builds with their chunk budgets. CI runs exactly this.

## Local visual review

Development-only screen deep links avoid repetitive navigation:

```text
?screen=main
?screen=practice
?screen=challenge
?screen=rivals
?screen=league
?screen=dreams
?screen=lounge
?screen=daily-rewards
?screen=daily-quests
?screen=stats
?screen=settings
?screen=game
?screen=game&socialPreview=waiting
?screen=game&socialPreview=reconnecting
```

Add `?debug=1` for the diagnostics panel, `?qa=1` for the `__LUCIDMATE_QA__`
contract (which also seeds a three-board inbox on `?screen=main`), and
`?renderer=webgpu` or `?renderer=webgl` to force a backend strictly — in forced
mode an unexpected renderer error is a failure rather than a fallback.

## What local verification cannot prove

Headless Chromium reports the WebGL backend on this machine, so real WebGPU
behaviour needs a device. Ads, purchases, entitlements, RUN storage, trusted
time, push delivery and inbox notifications all fail closed without a host:
locally they are correctly invisible or clearly marked PREVIEW, which is the
honest state, not evidence that they work. Those belong to a RUN Playground or
production-host pass.
