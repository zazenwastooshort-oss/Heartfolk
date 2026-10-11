import { describe, expect, it } from 'vitest';
import { XP_TABLE, MAX_XP, levelFor, levelBounds } from '../src/data/xp';

describe('xp curve', () => {
  it('rises with every level', () => {
    for (let l = 2; l <= 99; l++) expect(XP_TABLE[l]!).toBeGreaterThan(XP_TABLE[l - 1]!);
  });
  it('matches the prototype table at known points', () => {
    expect(XP_TABLE[2]).toBe(Math.floor((1 + Math.floor(290 * Math.pow(2, 1 / 7.1))) / 4));
    expect(MAX_XP).toBeGreaterThan(9_000_000);
  });
  it('maps xp to levels at the boundaries', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(XP_TABLE[10]! - 1)).toBe(9);
    expect(levelFor(XP_TABLE[10]!)).toBe(10);
    expect(levelFor(MAX_XP * 2)).toBe(99);
    expect(levelBounds(99)).toEqual([MAX_XP, MAX_XP]);
  });
});
