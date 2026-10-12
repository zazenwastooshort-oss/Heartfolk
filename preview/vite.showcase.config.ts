// One self-contained page of the opening cinematic for a private artifact link (not part of the game build).
// Like the game's web build: three.js from the jsDelivr CDN, everything else inlined.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const three: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).dependencies.three;

export default defineConfig({
  root: 'A:/Hearthfolk/showcase/preview',
  base: './',
  plugins: [viteSingleFile()],
  resolve: { alias: [{ find: /^three$/, replacement: `https://cdn.jsdelivr.net/npm/three@${three}/build/three.module.js` }] },
  build: {
    outDir: 'A:/Hearthfolk/showcase/out',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 8000,
    modulePreload: { polyfill: false },
    rollupOptions: { input: 'A:/Hearthfolk/showcase/preview/opening.html' },
  },
});
