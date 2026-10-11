// Keeps the modules detached from each other (CLAUDE.md, Architecture). Each folder in src/ is a layer that
// may only import from the layers listed for it, so a change in one area can't quietly reach into another:
// the simulation never touches graphics or the page, drawing never changes the game, the UI only sends commands.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

type Layer = 'data' | 'world' | 'core' | 'actors' | 'systems' | 'sim' | 'render' | 'ui' | 'main' | 'three' | 'assets' | 'other';

/** What each layer may import. `types` lists layers it may use for type-only imports as well. */
const ALLOWED: Partial<Record<Layer, { values: Layer[]; types?: Layer[] }>> = {
  data:    { values: ['data', 'assets'] },
  world:   { values: ['world', 'data'] },
  core:    { values: ['core', 'data', 'world'] },
  actors:  { values: ['actors', 'core', 'data', 'world'] },
  systems: { values: ['systems', 'actors', 'core', 'data', 'world'] },
  sim:     { values: ['core', 'data', 'world', 'actors', 'systems'] },
  render:  { values: ['render', 'core', 'data', 'world', 'three', 'assets'] },
  ui:      { values: ['ui', 'render', 'core', 'data', 'world', 'three'], types: ['systems'] },
};
/** Layers that must run headless (tests, simulations, a server one day): no three.js, no page. */
const HEADLESS: Layer[] = ['data', 'world', 'core', 'actors', 'systems', 'sim'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.d.ts') ? [p] : [];
  });
}

function layerOfFile(path: string): Layer {
  const rel = relative(SRC, path).split(sep);
  if (rel.length === 1) return rel[0] === 'sim.ts' ? 'sim' : rel[0] === 'main.ts' ? 'main' : 'other';
  if (rel[0] === '..') return 'assets';
  return (['data', 'world', 'core', 'actors', 'systems', 'render', 'ui'] as Layer[]).includes(rel[0] as Layer) ? rel[0] as Layer : 'other';
}

function layerOfImport(from: string, spec: string): Layer {
  if (spec === 'three' || spec.startsWith('three/')) return 'three';
  if (!spec.startsWith('.')) return 'other';
  const target = resolve(dirname(from), spec.split('?')[0]!);
  if (!target.startsWith(SRC.replace(/[\\/]$/, ''))) return 'assets';
  return layerOfFile(target.endsWith('.ts') || target.endsWith('.json') ? target : target + '.ts');
}

const IMPORT = /^\s*(import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

describe('module boundaries', () => {
  const all = files(SRC);

  it('finds the source files', () => { expect(all.length).toBeGreaterThan(10); });

  for (const file of all) {
    const layer = layerOfFile(file);
    const rule = ALLOWED[layer];
    if (!rule) continue;                            // main.ts wires everything together, by design
    it(`${relative(SRC, file)} only imports what the ${layer} layer may use`, () => {
      const src = readFileSync(file, 'utf8');
      const broken: string[] = [];
      for (const m of src.matchAll(IMPORT)) {
        const typeOnly = !!m[2], spec = m[3]!, target = layerOfImport(file, spec);
        const ok = rule.values.includes(target) || (typeOnly && rule.types?.includes(target));
        if (!ok) broken.push(`${spec} (${typeOnly ? 'type ' : ''}${target})`);
      }
      expect(broken, `not allowed in the ${layer} layer`).toEqual([]);
    });
  }

  it('keeps the simulation headless: no three.js, no page or browser globals', () => {
    const broken: string[] = [];
    for (const file of all.filter(f => HEADLESS.includes(layerOfFile(f)))) {
      const src = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
      if (/from\s+['"]three/.test(src)) broken.push(`${relative(SRC, file)} imports three`);
      if (/\b(document|window|requestAnimationFrame)\b/.test(src)) broken.push(`${relative(SRC, file)} uses the page`);
    }
    expect(broken).toEqual([]);
  });

  it('lets only systems change the game state from outside the simulation', () => {
    // the renderer and the UI read state; any assignment to state.* or player.* there is a bug
    const broken: string[] = [];
    for (const file of all.filter(f => ['render', 'ui'].includes(layerOfFile(f)))) {
      const src = readFileSync(file, 'utf8');
      const hit = src.match(/\b(state|player|p)\.(?:[a-zA-Z_.]+)\s*(?:=(?!=)|\+=|-=|\+\+|--)/);
      if (hit) broken.push(`${relative(SRC, file)}: ${hit[0]}`);
    }
    expect(broken).toEqual([]);
  });
});
