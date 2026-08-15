# LUCIDMATE

Portrait-first Neon chess. Pure-Pixi 8 WebGPU-first, SDK 5.24, Vite 6.

## Canon

- `DESIGN.md` — rules, economy, monetization
- Chess rules live in `src/game/chess/` (renderer-free)
- Themes are cosmetic only (`src/game/art/palette.ts`)

## Verify

```bash
npm run typecheck
npm run simulate
npm run build
```

Full gate: `npm run check`.

## Notes

- RUN game ID: `RuE1GRalg9GejuPtJD6t`.
- Chess pieces, board effects, UI decoration, and audio remain procedural.
  Project-owned Codex-generated PNG illustrations may support menus when the
  owner explicitly requests them.
- Use `npm install --cache /tmp/<dir>` if the default npm cache is root-owned.
