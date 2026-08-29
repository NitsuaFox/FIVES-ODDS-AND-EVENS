Original prompt: Implement all of these findings completely

## Scope
- Replace the single-round, first-player-biased flow with a fair three-round competitive match.
- Use concealed simultaneous starting selections and private peek knowledge.
- Guarantee equal scoring turns with neutral cells on odd boards and unrestricted re-entry when boxed in.
- Randomize the opening starter, alternate it each round, and decide the match by total score.
- Rebalance fives, explain every scored move, truly pause timers, and make CPU levels materially different.
- Add deterministic test/state hooks and validate rules, UI, pause, and complete match flow.

## Status
- Implemented the competitive engine: three rounds, alternating opener, equal quotas, neutral odd-board centre, re-entry, concealed starts, private memories/peeks, pausable timers, deterministic time advancement, and private state snapshots.
- Rebalanced fives to +0.3× with a three-pick cap and corrected the parity meter cap.
- Reworked CPU levels so Easy is random/no-memory, Normal retains 12 private peeks, and Hard keeps perfect private memory and evaluates actual projected points.
- Rebuilt the HUD/rules/result flow for round scores, match totals, claims, scoring explanations, and neutral/re-entry states.
- Added automated coverage for equal claims, neutral cells, concealed starts, private knowledge, pause timing, re-entry, opener alternation, scoring balance, and AI memory limits.
- Completed browser play-throughs covering setup, rules, private peeks, pause/resume, all three rounds, match results, restart, and return to menu.
- Ran symmetric matches per board size; 5×5, 8×8, and 10×10 all remain within normal random variance of a 50/50 result, including when wins are grouped by the randomly selected opening player.

## Verification
- `npm test`
- `npm run balance`
- Browser console: no game errors; only the expected standalone warning when the optional Wavedash SDK is unavailable.
- Playwright screenshots and `render_game_to_text` snapshots inspected after implementation.

## Remaining
- None for the requested fairness and gameplay findings. Real online networking still requires a lobby/transport/backend layer; the rules and private snapshots are structured for that future integration.

---

## Active objective
Turn FOE into a Node.js TypeScript application, seriously improve the look and feel, and add sound.

## Migration progress
- Added a Vite + strict TypeScript application structure under `src/` with Node-driven development, build, test, preview, and typecheck scripts.
- Ported the board, combo, AI, and competitive match engine to typed modules while preserving the verified fair-match behavior.
- Replaced the old landing page with a new responsive signal-lab visual system, procedural canvas ambience, redesigned setup/game HUD, and richer overlays.
- Added a procedural Web Audio engine with ambience, UI feedback, private-peek tones, player/CPU capture cues, five chords, clash, pause, round, and final-result sounds plus persistent mute control.
- Migrated all automated rules and balance tests to TypeScript and removed the obsolete static JavaScript/Python application.
- Updated Wavedash packaging to upload the Vite `dist/` output and documented the Node development workflow.

## Migration verification
- `npm run typecheck`: passes with strict TypeScript settings.
- `npm test`: all 9 gameplay/rules tests pass.
- `npm run balance`: 5,000 deterministic matches per board size remain statistically symmetric.
- `npm run build`: Vite production bundle succeeds with local bundled fonts and source maps.
- Production preview: menu, setup, hidden start, private peeks, scoring, pause freeze/resume, all three rounds, results, restart/menu, mute/unmute, and state hooks verified.
- Browser console: no warnings or errors during the complete match flow.
- Visual inspection completed for menu, setup, rules, gameplay HUD/board, private-peek state, pause, and final-result overlay.

## Migration remaining
- None for the Node.js TypeScript conversion, presentation redesign, or sound implementation.

---

## Responsive layout follow-up
- Replaced the implicit board rows with explicit equal row and column tracks so the board and every grid cell remain mathematically square at all supported sizes.
- Locked the desktop presentation to an exact 16:9 stage that scales against either viewport edge without stretching.
- Added a purpose-built portrait layout for menu, setup, match HUD, score cards, board, status dock, and overlays instead of reusing the desktop composition.
- Verified 5×5, 8×8, and 10×10 boards at 1280×720 and 320×568, plus portrait layouts at 390×844 and 430×932; all stayed inside the viewport with no page overflow or console errors. Browser sub-pixel rounding never exceeded 0.016 px between a cell's width and height.
