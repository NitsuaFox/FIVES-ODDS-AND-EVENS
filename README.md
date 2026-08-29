# FOE — Fives · Odds · Evens

FOE is a three-round memory and territory duel built as a Node.js, Vite and strict TypeScript web application.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:8000/`.

## Verification

```bash
npm run typecheck
npm test
npm run balance
npm run build
npm run preview
```

The production bundle is written to `dist/`. Wavedash uploads are configured to use that directory.

## Audio

FOE uses a procedural Web Audio soundscape, so no external audio files or network requests are required. The first pointer interaction unlocks audio in browsers that enforce autoplay restrictions. The sound button persists the mute preference in local storage.

Audio cues cover menu feedback, tile capture, private peeks, parity chains, multiples of five, start clashes, pause/resume, round results and match results. Press `F` to toggle fullscreen.

## Debug hooks

- Add `?debug=1` to enable debug mode.
- Press `T` in debug mode to advance an automated human move.
- `window.render_game_to_text()` returns the visible game state without leaking hidden values.
- `window.advanceTime(ms)` deterministically advances queued game timers.
