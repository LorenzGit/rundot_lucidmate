# LUCIDMATE — Design Doc

**Fantasy:** Classic chess, but every square is melting through a neon wormhole.

**Core loop:** Tap a piece → tap a legal square → capture fireworks → the cosmos (AI) answers → check pulses the board → mate pays auras.

**Session:** 2–12 minutes live, or one move at a time across several days.
Pass & play, AI (Easy / Standard / Expert; internally depth 1 / 2 / 3), live
matchmaking, and durable friend correspondence all use standard chess.

## Rules

Standard chess: castling, en passant, promotion, check, checkmate, stalemate, 50-move draw.

## Multiplayer

- Server-authoritative `ChessRoom` (`src/rooms/ChessRoom.ts`); clients send move intents only.
- Protocol: `src/game/chess/protocol.ts`.
- **Live:** cross-instance RUN matchmaking in `lucidmate-chess`.
- **Friend games:** persistent `lucidmate-correspondence` rooms keyed by an
  unguessable invite key. Daily allows 24 hours per move; Relaxed allows three
  days. Absolute server deadlines settle after idle freeze/resume.
- Home is a match inbox: Your Move, Waiting, Invitations, and recent results.
  Client storage contains match references only; the room owns board, seats,
  turn, clocks, result, reactions, and rematch offers.
- RUN share links accept a challenge in one tap. Server notifications deep-link
  opponent moves, accepted challenges, reactions, and rematches back to the board.
- Social communication is limited to four allowlisted chess reactions. There is
  no free text, so there is no user-authored message payload to moderate.
- Rival profiles derive head-to-head records from finished friend matches. The
  weekly Dream Division awards three points for a win and one for a draw, with
  no loss penalty.
- Local multiplayer dev: `npm run dev:multiplayer` (opt-in Vite plugin + room server).
- Production needs a deployed server bundle via the multiplayer build path.

## Progression

- **Auras** — soft currency from finished matches (win > draw > loss, plus capture/check bonuses).
- **Dream Rank** — permanent mastery earned from matches, wins, captures, and best streak.
  Six ranks create a visible multi-session path; crossing a rank grants an
  automatic aura cache. Rank never changes chess rules or AI strength.
- **Themes** — cosmetic trip skins. Acid free; Mango/Mintwave earnable; Nebula/UV/Lava via Run Bits.
- **Helpers** — Undo (12 auras) and Hint (8 auras); optional rewarded free uses after first match.

## Monetization (day-zero)

| Channel | Surface |
| --- | --- |
| Run Bits | Theme Pack (Nebula+UV), Ad-Free Forever, Trip Pass bundle |
| Rewarded | Free undo, free hint, double auras on results |
| Interstitial | Every 3rd finished match after first session |

Non-payer path: full rules, free/earned themes, helpers via auras from play.

## Presentation

- Pure Pixi 8 WebGPU-first, portrait-first + landscape.
- Quiet themed stage + light ambient sparkles and a WebGPU/WebGL chromatic
  breathing shader on the backdrop (not the board geometry; low quality disables it).
- Main menu is a multiplayer inbox with opponent identity, mini-boards, clear
  turn ownership, response deadline, challenge/live/practice entry points, and
  a visible daily return beat.
- Board juice: sliding piece arcs, selection bounce, capture/check/mate particles,
  board shake, pulsing legal-move marks, status pop, staggered piece intro.
- UI motion: staggered menu enter, modal scale-in, pill/button presses, HUD/helper
  bar flow. Reduced-motion kills decorative motion and keeps snaps.
- Turn chrome says whose turn it is before naming the moving color. Meaningful
  taps, moves, captures, checks, rewards, and failures use opt-out haptic cues.
- Pieces and audio are procedural — no image/audio files ship.
- RUN game ID: `RuE1GRalg9GejuPtJD6t`.

## Verify

`npm run typecheck` · `npm run simulate` · `npm run build` · `npm run check`
