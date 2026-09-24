# Third-party notices

LUCIDMATE's direct runtime dependencies are distributed under the following
licenses, as declared by the installed packages audited on 2026-09-22:

| Package | Reviewed version | License |
| --- | --- | --- |
| `@series-inc/rundot-game-sdk` | 5.24.0 | MIT |
| `firebase` | 12.16.0 | Apache-2.0 (dynamically imported by the RUN SDK) |
| `pixi.js` | 8.19.0 | MIT |
| `react` | 19.2.4 | MIT |
| `react-dom` | 19.2.4 | MIT |

The lockfile also resolves transitive and development dependencies. Their
license texts ship in their npm packages and remain controlling. Re-run a
dependency-license review whenever the lockfile changes, preserve required
copyright and attribution notices, and include applicable notices with any
distributed compiled build. This file does not replace those license texts.

## Development and QA tooling

| Package | Reviewed version | License |
| --- | --- | --- |
| `playwright-core` | 1.62.0 | Apache-2.0 |

Playwright drives `scripts/visual-qa.mjs`, `scripts/make-thumbnail.mjs`,
`scripts/capture-screenshots.mjs` and the multiplayer QA scripts for local and
CI verification. It is not included in the compiled game bundle.

## Assets

Chess pieces, board effects, UI decoration, backdrops and audio are generated
at runtime by the game's own code (`src/game/art/`, `src/audio/`). The six menu
illustrations in `src/assets/art/` and the store tile in `public/` are
project-owned generated images; no third-party image, font, or audio file is
redistributed here.

The repository's own materials are governed by [LICENSE.md](LICENSE.md).
