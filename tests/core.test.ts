import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { EventBus, type GameEvent } from '../src/core/events';
import { FixedLoop, STEP } from '../src/core/loop';
import { clockLabel, DAY_SECONDS } from '../src/core/clock';

describe('rng', () => {
  it('repeats exactly for the same seed', () => {
    const a = createRng(42), b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('stays in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('event bus', () => {
  it('delivers to subscribers and stops after unsubscribe', () => {
    const bus = new EventBus(), got: GameEvent[] = [];
    const off = bus.on(e => got.push(e));
    bus.emit({ type: 'arrived' }); off(); bus.emit({ type: 'arrived' });
    expect(got).toHaveLength(1);
  });
});

describe('fixed loop', () => {
  it('runs whole steps regardless of frame size', () => {
    let n = 0; const loop = new FixedLoop(() => n++);
    for (let i = 0; i < 30; i++) loop.advance(1 / 60);
    expect(n).toBe(15);
    loop.advance(10);                   // a long pause is capped
    expect(n).toBeLessThan(15 + Math.ceil(0.25 / STEP) + 1);
  });
});

describe('clock', () => {
  it('labels the time of day', () => {
    expect(clockLabel(0)).toBe('00:00');
    expect(clockLabel(DAY_SECONDS / 2)).toBe('12:00');
  });
});
