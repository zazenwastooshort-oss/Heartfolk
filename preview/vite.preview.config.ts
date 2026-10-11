// Vite dev server for the opening preview (preview/opening.html), outside the game build. The worktree's packages
// resolve from A:\Hearthfolk\node_modules, and the preview loads chunk A's village.glb from the main checkout, so
// both are allowed. Started by the "opening" entry in A:\Hearthfolk\.claude\launch.json (port 8791; 8790 was taken).
import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 8791, strictPort: true, fs: { allow: ['A:/Hearthfolk'] } },
});
