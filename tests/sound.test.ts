// Sound, made by the game's own code (0.0.35; the owner's pick, 13 Oct 2026: "Made in code"): which sound goes with
// what happens (ui/sound.ts cueFor), the two volume settings as remembered, and the music's pieces (ui/music.ts
// compose): in key, by day and by night, ending home, with long rests between. What Web Audio does with them is heard,
// not tested.
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { CAMP } from '../src/world/camp';
import { RESOURCES } from '../src/data/skills';
import { LEVEL_GAIN, MUSIC, SOUND_DEFAULTS, SOUND_LEVELS } from '../src/data/sound';
import { cueFor, soundLevelsOf } from '../src/ui/sound';
import { compose, hz, restAfter } from '../src/ui/music';

const nodeOf = (skill: string) => CAMP.nodes.find(n => RESOURCES[n.resource]?.skill === skill)!.id;

describe('the sound for what happens', () => {
  it('a strike by what is struck: a chop at a tree, a clink at a rock, a plip as a fish bites', () => {
    expect(cueFor({ type: 'strike', nodeId: nodeOf('woodcutting') }, CAMP)).toBe('chop');
    expect(cueFor({ type: 'strike', nodeId: nodeOf('mining') }, CAMP)).toBe('clink');
    expect(cueFor({ type: 'strike', nodeId: nodeOf('fishing') }, CAMP)).toBe('plip');
    expect(cueFor({ type: 'strike', nodeId: 'nowhere' }, CAMP)).toBeNull();
  });

  it('a blow by whether it lands, a bite likewise; the rest as they come', () => {
    expect(cueFor({ type: 'hit', target: 'dummy', damage: 2 }, CAMP)).toBe('whack');
    expect(cueFor({ type: 'hit', target: 'dummy', damage: 0 }, CAMP)).toBe('miss');
    expect(cueFor({ type: 'bitten', by: 'rat1', damage: 1 }, CAMP)).toBe('bitten');
    expect(cueFor({ type: 'bitten', by: 'rat1', damage: 0 }, CAMP)).toBe('miss');
    expect(cueFor({ type: 'cooked', burnt: false }, CAMP)).toBe('sizzle');
    expect(cueFor({ type: 'cooked', burnt: true }, CAMP)).toBe('burnt');
    expect(cueFor({ type: 'levelUp', skill: 'mining', level: 2 }, CAMP)).toBe('level');
    expect(cueFor({ type: 'goalDone', goal: 'campfire' }, CAMP)).toBe('goal');
    expect(cueFor({ type: 'itemGained', item: 'birch_logs', count: 1 }, CAMP)).toBe('gain');
    expect(cueFor({ type: 'banked', items: { stone: 2 } }, CAMP)).toBe('store');
    expect(cueFor({ type: 'stacked', logs: 4, pile: 4, at: 'woodpile' }, CAMP)).toBe('store');
    // nothing stacked (none on him, or the pile full): no sound, the notice says why
    expect(cueFor({ type: 'stacked', logs: 0, pile: 0, at: 'woodpile', reason: 'none' }, CAMP)).toBeNull();
    expect(cueFor({ type: 'noPath' }, CAMP)).toBeNull();
  });
});

describe('the two settings', () => {
  it('Off, Low, Medium or High each, remembered; anything else is its default (sounds medium, music low)', () => {
    expect(SOUND_LEVELS).toEqual(['off', 'low', 'medium', 'high']);
    expect(LEVEL_GAIN.off).toBe(0);
    expect(LEVEL_GAIN.low).toBeLessThan(LEVEL_GAIN.medium);
    expect(LEVEL_GAIN.medium).toBeLessThan(LEVEL_GAIN.high);
    expect(soundLevelsOf(null)).toEqual(SOUND_DEFAULTS);
    expect(SOUND_DEFAULTS).toEqual({ music: 'low', sounds: 'medium' });
    expect(soundLevelsOf('{"music":"off","sounds":"high"}')).toEqual({ music: 'off', sounds: 'high' });
    expect(soundLevelsOf('{"music":"loud","sounds":3}')).toEqual(SOUND_DEFAULTS);
    expect(soundLevelsOf('not json')).toEqual(SOUND_DEFAULTS);
    expect(soundLevelsOf('[1,2]')).toEqual(SOUND_DEFAULTS);
  });
});

describe('the music', () => {
  for (const night of [false, true]) {
    it(`a piece ${night ? 'by night (minor, slower)' : 'by day (major)'}: in key, in time, its chords held under it, ending on the root`, () => {
      const key = night ? MUSIC.night : MUSIC.day;
      for (let seed = 1; seed <= 30; seed++) {
        const p = compose(createRng(seed), night), beat = 60 / key.bpm;
        expect(p.night).toBe(night);
        expect(p.length).toBeCloseTo(MUSIC.bars * 4 * beat, 6);
        expect(p.melody.length).toBeGreaterThan(MUSIC.bars * 2);
        for (const n of p.melody) {
          expect(key.pentatonic as readonly number[]).toContain(((n.midi - key.root) % 12 + 12) % 12);
          expect(n.midi).toBeGreaterThanOrEqual(key.root);
          expect(n.midi).toBeLessThanOrEqual(key.root + 19);
          expect(n.at).toBeGreaterThanOrEqual(0);
          expect(n.at + n.dur).toBeLessThanOrEqual(p.length + 1e-9);
          expect(n.vel).toBeGreaterThan(0); expect(n.vel).toBeLessThanOrEqual(1);
        }
        expect(p.melody.at(-1)!.midi).toBe(key.root + 12);
        expect(p.pads).toHaveLength(MUSIC.bars * 3);
        for (const n of p.pads) expect(key.scale as readonly number[]).toContain(((n.midi - key.root) % 12 + 12) % 12);
      }
    });
  }

  it('the same random numbers write the same piece; others another', () => {
    expect(compose(createRng(7), false)).toEqual(compose(createRng(7), false));
    expect(compose(createRng(7), false)).not.toEqual(compose(createRng(8), false));
  });

  it('long rests between pieces, and pitches in hertz', () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) { const r = restAfter(rng); expect(r).toBeGreaterThanOrEqual(MUSIC.rest[0]); expect(r).toBeLessThanOrEqual(MUSIC.rest[1]); }
    expect(hz(69)).toBe(440);
    expect(hz(81)).toBeCloseTo(880, 6);
  });
});
