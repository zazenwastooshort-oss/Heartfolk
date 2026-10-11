// The "What's new" note: the player-facing changelog matches the build, and returning players see what they missed.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHANGELOG } from '../src/data/changelog';
import { isNewer, unseen } from '../src/ui/news';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

describe('changelog', () => {
  it("starts with this build's version, so every release gets a note", () => {
    expect(CHANGELOG[0]!.version).toBe(pkg.version);
  });

  it('lists each version once, newest first, each with notes written as sentences', () => {
    for (let i = 1; i < CHANGELOG.length; i++) expect(isNewer(CHANGELOG[i - 1]!.version, CHANGELOG[i]!.version)).toBe(true);
    for (const r of CHANGELOG) {
      expect(r.notes.length, r.version).toBeGreaterThan(0);
      for (const n of r.notes) expect(n, r.version).toMatch(/[.!?]$/);
    }
  });

  it('compares versions by number, not as text', () => {
    expect(isNewer('0.0.10', '0.0.9')).toBe(true);
    expect(isNewer('0.0.9', '0.0.10')).toBe(false);
    expect(isNewer('0.1.0', '0.0.99')).toBe(true);
    expect(isNewer('0.0.9', '0.0.9')).toBe(false);
  });
});

describe("what's new on opening", () => {
  const log = [
    { version: '0.0.12', date: '', notes: ['c.'] },
    { version: '0.0.11', date: '', notes: ['b.'] },
    { version: '0.0.10', date: '', notes: ['a.'] },
  ];
  it('shows nothing to a new player, or to one who has seen this version', () => {
    expect(unseen(null, false, log)).toEqual([]);
    expect(unseen('0.0.12', true, log)).toEqual([]);
  });
  it('shows a returning player every version since the one they saw', () => {
    expect(unseen('0.0.10', true, log).map(r => r.version)).toEqual(['0.0.12', '0.0.11']);
  });
  it('shows a player from before the note existed only the latest version', () => {
    expect(unseen(null, true, log).map(r => r.version)).toEqual(['0.0.12']);
  });
});
