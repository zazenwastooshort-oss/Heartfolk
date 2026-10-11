import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two builds, both one self-contained HTML file:
//  npm run build      -> dist/index.html: everything inlined, works offline (and later inside an Android app)
//  npm run build:web  -> dist-web/: the shareable web page (an artifact link). three.js loads from the jsDelivr
//                        CDN at the exact version in package.json instead of being bundled, keeping the page small.
const threeVersion: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).dependencies.three;
const THREE_CDN = `https://cdn.jsdelivr.net/npm/three@${threeVersion}/build/three.module.js`;

export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    base: './',
    plugins: [viteSingleFile()],
    // URL imports stay external, so `import ... from 'three'` (ours and the bundled GLTFLoader's) loads from the CDN
    resolve: web ? { alias: [{ find: /^three$/, replacement: THREE_CDN }] } : {},
    build: {
      outDir: web ? 'dist-web' : 'dist',
      assetsInlineLimit: 100_000_000,
      chunkSizeWarningLimit: 4000,
      modulePreload: { polyfill: false },
    },
    test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  };
});
