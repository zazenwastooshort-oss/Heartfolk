// The opening cinematic's timeline (world/opening.ts): continuous, physically sensible, never puts the camera in the
// rock or under the water, never shows the camp from above the clouds, and ends exactly where the game begins.
import { describe, expect, it } from 'vitest';
import {
  OPENING_DURATION, OPENING_REDUCED_DURATION, cloudDeckY, edgeZ, faceZ, openingDuration, openingFrame, orbitCamera,
  storySpeed, storyTime, type OpeningFrame, type OpeningSite,
} from '../src/world/opening';

// the camp after chunk A (world/camp.ts): a 70 m wall leaning back 0.14 m per metre, like render/waterfall.ts
const CAMP_SITE: OpeningSite = {
  lip: { x: -14, z: -15.2 }, width: 3.6, height: 70, pool: { pos: { x: -14, z: -11.2 }, radius: 3.8 },
  start: { x: -8.8, z: -7.6 }, startYaw: Math.PI / 2, lean: 0.14,
};
// a different site: a straight face, lower, the bank on the other side
const OTHER_SITE: OpeningSite = {
  lip: { x: 6, z: -20 }, width: 5, height: 45, pool: { pos: { x: 6, z: -15 }, radius: 4.5 }, start: { x: 0.5, z: -10 },
};
const water = (s: OpeningSite) => s.water ?? 0.07;
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function frames(site: OpeningSite, reduced = false, step = 1 / 60): OpeningFrame[] {
  const end = orbitCamera(site.start), out: OpeningFrame[] = [], dur = openingDuration(reduced);
  for (let i = 0; i * step <= dur + 1e-9; i++) out.push(openingFrame(site, end, i * step, reduced));
  return out;
}

for (const [name, site] of [['the camp', CAMP_SITE], ['another site', OTHER_SITE]] as const) {
  describe(`opening cinematic at ${name}`, () => {
    const end = orbitCamera(site.start, Math.PI / 2, 38, 13, 50);
    const all = frames(site);
    const H = site.height;

    it('lasts about 16 seconds, the reduced-motion version about 5', () => {
      expect(OPENING_DURATION).toBeGreaterThanOrEqual(14); expect(OPENING_DURATION).toBeLessThanOrEqual(18);
      expect(OPENING_REDUCED_DURATION).toBeGreaterThanOrEqual(4); expect(OPENING_REDUCED_DURATION).toBeLessThanOrEqual(6);
      expect(all.at(-1)!.done).toBe(true);
      expect(all.filter(f => f.done).length).toBe(1);
    });

    it('runs the five shots in order', () => {
      const shots = all.map(f => f.shot);
      for (let i = 1; i < shots.length; i++) expect(shots[i]!).toBeGreaterThanOrEqual(shots[i - 1]!);
      expect(new Set(shots)).toEqual(new Set([1, 2, 3, 4, 5]));
    });

    it('moves the hero without jumps, and turns him smoothly', () => {
      for (let i = 1; i < all.length; i++) {
        // falling (about 37 m/s at the pool), and the plunge just after it, carried on by that speed
        const splashAt = all.at(-1)!.events.find(e => e.kind === 'splash')!.at;
        const a = all[i - 1]!.hero, b = all[i]!.hero;
        const falling = a.pose === 'tumble' || b.pose === 'tumble' || (all[i]!.t > splashAt && all[i]!.t < splashAt + 0.3);
        expect(dist(a.pos, b.pos), `t=${all[i]!.t.toFixed(3)} ${a.pose}->${b.pose}`).toBeLessThan(falling ? 0.8 : 0.15);
        for (const k of ['yaw', 'pitch', 'roll'] as const) expect(Math.abs(wrap(b[k] - a[k])), `${k} at t=${all[i]!.t.toFixed(3)}`).toBeLessThan(0.25);
        expect(Math.abs(b.lift - a.lift)).toBeLessThan(0.1);
        for (const v of [b.pos.x, b.pos.y, b.pos.z, b.yaw, b.pitch, b.roll, b.lift]) expect(Number.isFinite(v)).toBe(true);
      }
    });

    it('goes through the poses in the story order', () => {
      const order = ['float', 'tumble', 'swim', 'crawl', 'lie', 'rise', 'stand'];
      const seen = all.map(f => f.hero.pose).filter((p, i, a) => p !== a[i - 1]);
      expect(seen).toEqual(order);
    });

    it('ends exactly at the start, standing, with the camera exactly at the game camera', () => {
      const last = all.at(-1)!;
      expect(last.hero.pos).toEqual({ x: site.start.x, y: 0, z: site.start.z });
      expect(last.hero.pose).toBe('stand');
      expect(last.hero.pitch).toBe(0); expect(last.hero.roll).toBe(0); expect(last.hero.lift).toBe(1);
      expect(last.hero.yaw).toBe(site.startYaw ?? Math.PI / 2);
      expect(last.camera).toEqual(end);
      expect(last.letterbox).toBe(0); expect(last.fade).toBe(0); expect(last.mist).toBe(0);
      expect(last.showWorld).toBe(true); expect(last.showSet).toBe(false);
    });

    it('settles into the game camera without a jump', () => {
      for (let i = 1; i < all.length; i++) {
        if (all[i]!.t < 10.05) continue;                        // the shots before cut; shots 4 and 5 are one move
        expect(dist(all[i]!.camera.pos, all[i - 1]!.camera.pos), `t=${all[i]!.t}`).toBeLessThan(0.2);
        expect(dist(all[i]!.camera.look, all[i - 1]!.camera.look)).toBeLessThan(0.2);
      }
      // and it slows to a stop as it arrives
      const n = all.length;
      expect(dist(all[n - 1]!.camera.pos, all[n - 2]!.camera.pos)).toBeLessThan(0.002);
    });

    it('never puts the camera inside the rock, or below the ground or the water', () => {
      for (const f of all) {
        const c = f.camera.pos, at = `t=${f.t.toFixed(3)} shot ${f.shot}`;
        expect(c.y, at).toBeGreaterThan(water(site) + 0.5);
        if (c.y < H + 0.8) expect(c.z, at).toBeGreaterThan(faceZ(site, c.y) + 1.5);    // below the clifftop: in the open air
        if (c.z < edgeZ(site) + 0.5) expect(c.y, at).toBeGreaterThan(H + 0.8);          // over the clifftop: above the banks
        expect(f.camera.fov).toBeGreaterThan(30); expect(f.camera.fov).toBeLessThan(80);
        expect(dist(f.camera.pos, f.camera.look)).toBeGreaterThan(1);
      }
    });

    it('drops him through the open air south of the face and into the pool', () => {
      const fall = all.filter(f => f.hero.pose === 'tumble');
      expect(fall.length).toBeGreaterThan(60);
      for (const f of fall) {
        const h = f.hero.pos;
        if (h.y < H - 1) expect(h.z, `t=${f.t.toFixed(3)}`).toBeGreaterThan(faceZ(site, h.y) + 0.8);
        expect(h.y).toBeLessThanOrEqual(H);
      }
      const splash = all.at(-1)!.events.filter(e => e.kind === 'splash');
      expect(splash.length).toBe(1);
      const s = splash[0]!.pos, pool = site.pool;
      expect(Math.hypot(s.x - pool.pos.x, s.z - pool.pos.z)).toBeLessThan(pool.radius - 1);
      // where he lands is where he is at the splash
      const atSplash = all.find(f => f.t >= splash[0]!.at)!;
      expect(Math.hypot(atSplash.hero.pos.x - s.x, atSplash.hero.pos.z - s.z)).toBeLessThan(0.2);
      expect(Math.abs(atSplash.hero.pos.y - water(site))).toBeLessThan(0.7);
      // he swims inside the pool and climbs out towards the start
      for (const f of all.filter(f => f.hero.pose === 'swim')) {
        expect(Math.hypot(f.hero.pos.x - pool.pos.x, f.hero.pos.z - pool.pos.z)).toBeLessThan(pool.radius);
        expect(f.hero.pos.y).toBeLessThanOrEqual(water(site));
      }
    });

    it('floats on the river up top, on his back, before the edge', () => {
      for (const f of all.filter(f => f.hero.pose === 'float')) {
        expect(Math.abs(f.hero.pos.y - H)).toBeLessThan(0.3);
        expect(f.hero.pos.z).toBeLessThan(edgeZ(site) + 0.01);
        expect(Math.cos(f.hero.pitch + Math.PI / 2)).toBeGreaterThan(0.95);
      }
    });

    it('never shows the camp from above the clouds', () => {
      const deck = cloudDeckY(site);
      expect(deck).toBeLessThan(H - 5);
      for (const f of all) {
        if (f.camera.pos.y >= deck) expect(f.showWorld, `t=${f.t.toFixed(3)}`).toBe(false);
        if (f.shot <= 2) expect(f.showWorld).toBe(false);
      }
      // the fall goes through the cloud: white for a moment
      expect(Math.max(...all.map(f => f.mist))).toBeGreaterThan(0.7);
    });

    it('slows time for a heartbeat as he tips over, keeping it monotonic', () => {
      let prev = -Infinity;
      for (let t = 0; t <= OPENING_DURATION; t += 1 / 240) { const s = storyTime(t); expect(s).toBeGreaterThan(prev); prev = s; }
      const slowest = all.reduce((a, f) => (f.speed < a.speed ? f : a));
      expect(slowest.speed).toBeLessThan(0.3);
      expect(slowest.shot).toBe(2);
      expect(Math.abs(slowest.t - all.at(-1)!.events.find(e => e.kind === 'tip')!.at)).toBeLessThan(0.4);
      expect(storySpeed(2)).toBe(1); expect(storySpeed(12)).toBe(1);
    });

    it('skipping gives the final frame', () => {
      const final = openingFrame(site, end, OPENING_DURATION);
      expect(openingFrame(site, end, Infinity)).toEqual(final);
      expect(openingFrame(site, end, 1e9)).toEqual(final);
      expect(final.done).toBe(true);
      expect(openingFrame(site, end, -3)).toEqual(openingFrame(site, end, 0));
    });

    it('the reduced-motion version washes him ashore with a still camera and ends the same way', () => {
      const rm = frames(site, true);
      const full = openingFrame(site, end, OPENING_DURATION), last = rm.at(-1)!;
      expect(last.done).toBe(true);
      expect(last.hero).toEqual(full.hero);
      expect(last.camera).toEqual(full.camera);
      expect(rm[0]!.fade).toBe(1); expect(last.fade).toBe(0);
      for (const f of rm) {
        expect(['tumble', 'float']).not.toContain(f.hero.pose);
        expect(f.camera).toEqual(end);
        expect(f.showSet).toBe(false); expect(f.showWorld).toBe(true);
        expect(f.wreck.every(w => !w.visible)).toBe(true);
        expect(f.events.every(e => e.kind !== 'splash' && e.kind !== 'tip')).toBe(true);
      }
      for (let i = 1; i < rm.length; i++) expect(dist(rm[i]!.hero.pos, rm[i - 1]!.hero.pos)).toBeLessThan(0.15);
      expect(openingFrame(site, end, Infinity, true)).toEqual(last);
    });

    it('reports splashes and ripples by age, so scrubbing draws the same', () => {
      const f = openingFrame(site, end, 12.5);
      const kinds = f.events.map(e => e.kind);
      expect(kinds).toEqual(expect.arrayContaining(['tip', 'splash', 'surface', 'stroke']));
      for (const e of f.events) { expect(e.age).toBeCloseTo(12.5 - e.at, 9); expect(e.age).toBeGreaterThanOrEqual(0); }
      expect(openingFrame(site, end, 3).events).toEqual([]);
    });
  });
}
