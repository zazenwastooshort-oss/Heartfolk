// Turns the web build (dist-web/index.html) into a page an artifact link can host:
//  - the host supplies <html>, <head>, <body>, the charset and the viewport, so those come out
//  - the <title> moves to the very top (the host only scans the first 8 KB for it)
// Writes dist-web/hearthfolk.html (publish this) and dist-web/preview.html (the same page inside a stand-in
// for the host's skeleton, for testing locally). Run by `npm run build:web`.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist-web/', import.meta.url);
let html = readFileSync(new URL('index.html', dir), 'utf8');

// leave the inlined scripts untouched: only edit the markup around them
const scripts = [];
html = html.replace(/<script\b[\s\S]*?<\/script>/gi, m => `\u0000${scripts.push(m) - 1}\u0000`);
const title = html.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? '<title>Hearthfolk</title>';
html = html
  .replace(title, '')
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?html\b[^>]*>/gi, '')
  .replace(/<\/?head>/gi, '')
  .replace(/<\/?body\b[^>]*>/gi, '')
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .replace(/\n\s*\n+/g, '\n');
html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => scripts[Number(i)]);
const page = `${title}\n${html.trim()}\n`;
writeFileSync(new URL('hearthfolk.html', dir), page);

const preview = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
${page}</body></html>
`;
writeFileSync(new URL('preview.html', dir), preview);
console.log(`hearthfolk.html ${Math.round(page.length / 1024)} KB (title first: ${page.startsWith('<title>')})`);
