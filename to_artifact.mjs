// Same as tools/web_page.mjs, for the showcase build: out/opening.html -> out/hearthfolk-opening.html, a page an
// artifact link can host (the host supplies <html>, <head>, <body>, charset and viewport; the <title> goes first).
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('./out/', import.meta.url);
let html = readFileSync(new URL('opening.html', dir), 'utf8');
const scripts = [];
html = html.replace(/<script\b[\s\S]*?<\/script>/gi, m => `\u0000${scripts.push(m) - 1}\u0000`);
const title = html.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? '<title>Hearthfolk Opening</title>';
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
writeFileSync(new URL('hearthfolk-opening.html', dir), page);
console.log(`hearthfolk-opening.html ${Math.round(page.length / 1024)} KB (title first: ${page.startsWith('<title>')})`);
