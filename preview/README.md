# preview/

Dev-only pages, outside the game build (not in `index.html`, not in `npm run build`).

- `opening.html`, `opening.ts`: the opening cinematic (`src/world/opening.ts`, `src/render/opening.ts`, `src/ui/opening.ts`)
  over a stand-in of the camp. Play/Restart, Pause, Skip, a time scrubber; `?t=<seconds>` freezes at a time, `?rm=1`
  forces the reduced-motion version.
- `standin.ts`: the stand-in camp (the game's ground and river, a simplified 70 m leaning wall, mist, the pool, the wreck).
- `vite.preview.config.ts`: the dev server (port 8791, allows `A:/Hearthfolk` for packages and chunk A's `village.glb`).
- `tsconfig.json`: type-checks these pages: `npx tsc --noEmit -p preview/tsconfig.json`.

Run: the "opening" entry in `A:\Hearthfolk\.claude\launch.json`, or
`node A:\Hearthfolk\node_modules\vite\bin\vite.js <worktree> --config <worktree>\preview\vite.preview.config.ts`,
then open http://127.0.0.1:8791/preview/opening.html.
