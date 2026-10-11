// The opening cinematic (approved 12 Oct 2026), as a pure timeline: given the falls and the camp (a site) and where the
// game camera will be when play starts, it says where everything is at any moment t. No graphics, no page: the render
// (render/opening.ts) draws a frame and the UI (ui/opening.ts) shows the bars and the Skip button. About 16 seconds:
//   1 Adrift    0-5     far above in the clouds he floats on his back down a wide calm river towards the edge, planks
//                       and a crate bobbing round him; the camera skims low over the water behind him, rising slowly
//   2 The edge  5-7     the camera swings out past the lip and looks back; he tips over and time slows for a heartbeat,
//                       then it looks down past him: nothing but mist
//   3 The fall  7-10    the camera falls with him through the cloud, the wall streaming past; the pool appears below
//   4 Impact    10-11.5 from the bank: a big splash and white foam, then stillness
//   5 Ashore    11.5-16 he surfaces, swims to the bank, drags himself out, lies still, gets up; the camera settles
//                       exactly into the game camera and the cinematic is done
// The reduced-motion version (prefers-reduced-motion) has no fall: the game camera stays still and the picture fades in
// on shot 5, him washing ashore (about 5 s), ending the same way.
//
// Conventions: x east, z south, y up, metres, ground at y = 0. Real time t runs the shots; the hero moves in story
// time, which runs slower for a heartbeat as he tips over (storyTime, monotonic). Hero `yaw` uses the game's heading
// (0 faces +x, positive turns towards -z, as state.player.heading and the model's rotation.y); `pitch` tips him forward
// about his own sideways axis (+PI/2 lies face down, head forward; -PI/2 lies on his back, head behind), `roll` turns
// him about his heading. `pos` is the ground or water under the middle of his body; `lift` (0 lying, 1 standing) says
// how high his hips are above it, so the render can turn him about the hips.
import type { Vec2 } from './layout';

export interface Vec3 { x: number; y: number; z: number }

/** Where the cinematic happens; integration passes the real layout's falls and start. */
export interface OpeningSite {
  /** the foot of the wall where the water lands (layout falls.lip): the face runs east-west along this z */
  lip: Vec2;
  /** how wide the water is where it goes over */
  width: number;
  /** how high the wall is: the clifftop (and the upper river) is at this y */
  height: number;
  pool: { pos: Vec2; radius: number };
  /** where he ends up standing, and the way he faces then (game heading; default PI/2, north to the falls) */
  start: Vec2;
  startYaw?: number;
  /** the face leans back this many metres for every metre up (the camp's wall: 0.14); 0 = straight up */
  lean?: number;
  /** the pool's surface height (default 0.07) */
  water?: number;
}

export interface OpeningCamera { pos: Vec3; look: Vec3; fov: number }

export type OpeningPose = 'float' | 'tumble' | 'swim' | 'crawl' | 'lie' | 'rise' | 'stand';
export type OpeningEventKind = 'tip' | 'splash' | 'surface' | 'stroke' | 'ashore';
/** Something that happened at `at` (real time), `age` seconds ago: the render animates splashes and ripples by age,
 *  so scrubbing back and forth draws the same thing. */
export interface OpeningEvent { kind: OpeningEventKind; at: number; age: number; pos: Vec3 }

export interface OpeningHero {
  pos: Vec3; yaw: number; pitch: number; roll: number; lift: number;
  pose: OpeningPose;
  /** 0..1 through the current pose */
  phase: number;
}
/** A piece of the wreck drifting and falling with him (two planks and the crate); hidden once it hits the pool. */
export interface OpeningWreck { kind: 'plank' | 'crate'; pos: Vec3; yaw: number; pitch: number; visible: boolean }

export interface OpeningFrame {
  t: number;
  /** story time (slower for a heartbeat at the edge) and how fast it runs now (1 normal) */
  story: number; speed: number;
  shot: 1 | 2 | 3 | 4 | 5;
  /** 0..1 through the shot */
  shotT: number;
  hero: OpeningHero;
  wreck: OpeningWreck[];
  camera: OpeningCamera;
  /** 0..1: the black bars top and bottom */
  letterbox: number;
  /** 0..1: black over the picture (the reduced-motion version fades in) */
  fade: number;
  /** 0..1: white-out while the camera is inside the cloud */
  mist: number;
  /** 0..1: streaks of cloud rushing past during the fall */
  streaks: number;
  /** draw the camp below? false while the camera is above the cloud deck (the camp must never be seen from there) */
  showWorld: boolean;
  /** draw the clifftop set? (only until the fall is over; it is never part of the game) */
  showSet: boolean;
  events: OpeningEvent[];
  done: boolean;
}

// ---- timing (real seconds) -------------------------------------------------------------------------------------
export const OPENING_DURATION = 16;
export const OPENING_REDUCED_DURATION = 5;
const SHOT_START = [0, 5, 7, 10, 11.5, OPENING_DURATION] as const;
const T = { lip: 5.95, swingEnd: 5.75, impact: 10, surface: 11.9, edge: 13.1, ashore: 14.0, rise: 14.6, stand: 15.6 };
/** time slows round `at`, to `1 - depth` of normal speed at its slowest, over `at` +- `half` */
const SLOW = { at: 6.1, half: 0.6, depth: 0.8 };
/** the reduced-motion version shows the full timeline from here on */
const REDUCED_FROM = OPENING_DURATION - OPENING_REDUCED_DURATION;
const STROKES = [12.15, 12.55, 12.95];
/** how far under the surface his middle floats on his back */
const FLOAT_SINK = 0.22;

export const openingDuration = (reduced = false) => reduced ? OPENING_REDUCED_DURATION : OPENING_DURATION;

/** Story time at real time t: monotonic, slower round the tip over the edge. */
export function storyTime(t: number): number {
  const { at, half, depth } = SLOW, a = at - half;
  if (t <= a) return t;
  if (t >= at + half) return t - depth * half;
  return t - depth * 0.5 * ((t - a) + (half / Math.PI) * Math.sin(Math.PI * (t - at) / half));
}
export function storySpeed(t: number): number {
  const { at, half, depth } = SLOW;
  return Math.abs(t - at) >= half ? 1 : 1 - depth * 0.5 * (1 + Math.cos(Math.PI * (t - at) / half));
}

// ---- the set's shape (the render builds the same shapes) ---------------------------------------------------------
/** The top of the cloud sea below the lip: from above, nothing under it can be seen. */
export const cloudDeckY = (site: OpeningSite) => site.height * 0.8;
/** z of the clifftop's edge, where the water goes over. */
export const edgeZ = (site: OpeningSite) => site.lip.z - (site.lean ?? 0) * site.height;
/** z of the wall face at height y (rock to the north, open air to the south). */
export const faceZ = (site: OpeningSite, y: number) => site.lip.z - (site.lean ?? 0) * clamp(y, 0, site.height);
/** Half the upper river's width at z: wide and calm upstream, narrowing to the falls' width at the edge. */
export function riverHalfWidth(site: OpeningSite, z: number): number {
  const wide = Math.max(16, site.width * 4), k = smooth(clamp((edgeZ(site) - z) / 28, 0, 1));
  return (site.width + (wide - site.width) * k) / 2;
}
/** Where he goes over: a little east of the middle of the lip. */
export const overX = (site: OpeningSite) => site.lip.x + Math.min(1, site.width * 0.22);

// ---- small maths -----------------------------------------------------------------------------------------------
function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
function smooth(k: number) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
function smoother(k: number) { k = clamp(k, 0, 1); return k * k * k * (k * (k * 6 - 15) + 10); }
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => v3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const headingOf = (dx: number, dz: number) => Math.atan2(-dz, dx);

// ---- the plan for one site ---------------------------------------------------------------------------------------
interface Plan {
  site: OpeningSite; H: number; water: number; edgeZ: number; xLip: number; y0: number;
  sLip: number; sImpact: number; T: number; g: number;
  /** drift: z = edgeZ - D + D (u + kk u^3) / (1 + kk), u = s / sLip */
  D: number; kk: number;
  /** fall: horizontal travel eases off like drag, starting at the river's speed */
  k: number; land: Vec2; surf: Vec2; edge: Vec2; lie: Vec2;
  swimYaw: number; startYaw: number;
}

const plans = new WeakMap<OpeningSite, Plan>();
function plan(site: OpeningSite): Plan {
  const cached = plans.get(site); if (cached) return cached;
  const H = site.height, water = site.water ?? 0.07, eZ = edgeZ(site), xLip = overX(site);
  const { pos: pc, radius: r } = site.pool;
  const dx = site.start.x - pc.x, dz = site.start.z - pc.z, dl = Math.hypot(dx, dz) || 1, dir = { x: dx / dl, z: dz / dl };
  const at = (k: number): Vec2 => ({ x: pc.x + dir.x * r * k, z: pc.z + dir.z * r * k });
  const land = at(0.3), surf = at(0.58), edge = at(1 - 0.25 / r);
  const lie = { x: site.start.x - dir.x * 0.45, z: site.start.z - dir.z * 0.45 };
  const sLip = storyTime(T.lip), sImpact = storyTime(T.impact), fallT = sImpact - sLip;
  const y0 = H - FLOAT_SINK;                                   // floating, half under
  const g = 2 * (y0 - water) / (fallT * fallT);
  // the river's speed at the edge carries him out; it must be enough to reach the landing spot
  const Dz = land.z - eZ, vEnd = Math.max(2.4, 1.4 * Dz / fallT);
  // solve k so the fall's horizontal speed starts at vEnd: Dz k / (1 - e^-kT) = vEnd (increasing in k)
  let lo = 1e-4, hi = 20;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (Dz * m / (1 - Math.exp(-m * fallT)) < vEnd) lo = m; else hi = m; }
  const k = (lo + hi) / 2;
  // drift: from a calm 1.6 m/s up to vEnd at the edge
  const vStart = Math.min(1.6, vEnd * 0.8), kk = (vEnd / vStart - 1) / 3, D = vStart * (1 + kk) * sLip;
  const p: Plan = {
    site, H, water, edgeZ: eZ, xLip, y0, sLip, sImpact, T: fallT, g, D, kk, k, land, surf, edge, lie,
    swimYaw: headingOf(dir.x, dir.z), startYaw: site.startYaw ?? Math.PI / 2,
  };
  plans.set(site, p);
  return p;
}

/** Drifting down the river, then falling (s up to impact): where a body that left the lip at story time sLip is.
 *  dx: how far east of his line it floats (pieces of the wreck), narrowing with the river. */
function driftFall(p: Plan, s: number, dx = 0): Vec3 {
  const { H, edgeZ: eZ, xLip, sLip } = p;
  if (s <= sLip) {
    const u = s / sLip, z = eZ - p.D + p.D * (u + p.kk * u * u * u) / (1 + p.kk);
    const narrow = riverHalfWidth(p.site, z) / riverHalfWidth(p.site, eZ - 60);
    const sway = 1.3 * Math.pow(Math.max(0, 1 - u), 2) * Math.sin(0.8 * s + 0.6);
    const bob = 0.04 * Math.sin(2.3 * s) * Math.max(0, 1 - u);
    return v3(xLip + sway + dx * narrow, H - FLOAT_SINK + bob, z);
  }
  const tau = Math.min(s - sLip, p.T), f = (1 - Math.exp(-p.k * tau)) / (1 - Math.exp(-p.k * p.T));
  const narrow = riverHalfWidth(p.site, eZ) / riverHalfWidth(p.site, eZ - 60);
  return v3(lerp(xLip, p.land.x, f) + dx * narrow * (1 + 0.6 * f), p.y0 - 0.5 * p.g * tau * tau, lerp(eZ, p.land.z, f));
}

function heroAt(p: Plan, t: number): OpeningHero {
  const s = storyTime(t), { water } = p;
  if (t < T.lip) {
    const u = s / p.sLip, calm = 1 - u;
    return { pos: driftFall(p, s), yaw: -Math.PI / 2 + 0.5 * calm * Math.sin(0.5 * s + 0.3),
      pitch: -Math.PI / 2 + 0.06 * calm * Math.sin(1.7 * s), roll: 0.1 * calm * Math.sin(1.3 * s), lift: 0, pose: 'float', phase: u };
  }
  if (t < T.impact) {
    const tau = s - p.sLip, u = tau / p.T;
    // three and a quarter turns heels over head, slow as he tips, entering the water feet first
    const turn = 0.7 * u + 0.3 * smooth(u);
    return { pos: driftFall(p, s), yaw: -Math.PI / 2 + 0.9 * smooth(u), pitch: -Math.PI / 2 + (6.5 * Math.PI) * turn,
      roll: 0.5 * Math.sin(2.1 * tau) * Math.sin(Math.PI * u), lift: smooth(u), pose: 'tumble', phase: u };
  }
  const yawIn = -Math.PI / 2 + 0.9, yawTurn = wrap(p.swimYaw - yawIn);
  if (t < T.surface) {
    // under the water: plunging down, then coming up towards the bank and turning face down to swim
    const u = span(t, T.impact, T.surface), mv = smooth(span(t, 11.1, T.surface));
    // plunging deep enough to hide him upright, slowing fast, then floating up
    const y = water - 0.18 * smooth(u) - 2.8 * (1 - Math.exp(-u / 0.06)) * (1 - smooth(span(u, 0.3, 1)));
    return { pos: v3(lerp(p.land.x, p.surf.x, mv), y, lerp(p.land.z, p.surf.z, mv)), yaw: yawIn + yawTurn * smooth(u),
      pitch: 1.42 * smooth(u), roll: 0, lift: 1 - smooth(u), pose: 'swim', phase: 0 };
  }
  if (t < T.edge) {
    const u = span(t, T.surface, T.edge), k = 0.35 * u + 0.65 * smooth(u), st = (t - T.surface) * 2.5 * Math.PI;
    return { pos: v3(lerp(p.surf.x, p.edge.x, k), water - 0.18 + 0.03 * Math.sin(2 * st), lerp(p.surf.z, p.edge.z, k)),
      yaw: p.swimYaw + 0.06 * Math.sin(st), pitch: 1.42, roll: 0.12 * Math.sin(st), lift: 0, pose: 'swim', phase: u };
  }
  if (t < T.ashore) {
    // dragging himself out in three pulls
    const u = span(t, T.edge, T.ashore), k = u - Math.sin(u * 6 * Math.PI) / (6 * Math.PI);
    return { pos: v3(lerp(p.edge.x, p.lie.x, k), lerp(water - 0.18, 0, smooth(u * 2)), lerp(p.edge.z, p.lie.z, k)),
      yaw: p.swimYaw, pitch: lerp(1.42, Math.PI / 2, u), roll: 0.08 * Math.sin(u * 6 * Math.PI), lift: 0.06 * Math.sin(u * Math.PI),
      pose: 'crawl', phase: u };
  }
  const yawEnd = wrap(p.startYaw - p.swimYaw), turn = smooth(span(t, T.rise, OPENING_DURATION - 0.1));
  const yaw = p.startYaw - yawEnd * (1 - turn);
  if (t < T.rise) {
    return { pos: v3(p.lie.x, 0, p.lie.z), yaw, pitch: Math.PI / 2, roll: 0, lift: 0, pose: 'lie', phase: span(t, T.ashore, T.rise) };
  }
  if (t < T.stand) {
    const u = span(t, T.rise, T.stand), k = smooth(u);
    return { pos: v3(lerp(p.lie.x, p.site.start.x, k), 0, lerp(p.lie.z, p.site.start.z, k)), yaw,
      pitch: Math.PI / 2 * (1 - k), roll: 0, lift: k, pose: 'rise', phase: u };
  }
  return { pos: v3(p.site.start.x, 0, p.site.start.z), yaw: t >= OPENING_DURATION ? p.startYaw : yaw, pitch: 0, roll: 0, lift: 1,
    pose: 'stand', phase: span(t, T.stand, OPENING_DURATION) };
}

const WRECK: { kind: 'plank' | 'crate'; lead: number; dx: number }[] = [
  { kind: 'plank', lead: 0.8, dx: 1.6 }, { kind: 'plank', lead: 0.35, dx: -1.8 }, { kind: 'crate', lead: -0.6, dx: 2.1 },
];
function wreckAt(p: Plan, t: number): OpeningWreck[] {
  const s = storyTime(t);
  return WRECK.map((w, i) => {
    const sw = s + w.lead, pos = driftFall(p, sw, w.dx), falling = sw > p.sLip;
    const tau = Math.max(0, sw - p.sLip);
    const visible = sw < p.sImpact && t < T.impact + 0.5;
    // riding a little higher than he does, bobbing until they go over
    pos.y += 0.14 + 0.05 * Math.sin(2.1 * s + i * 1.7) * (1 - smooth(tau * 2));
    return { kind: w.kind, pos, yaw: i * 1.3 + 0.3 * Math.sin(0.7 * s + i) + 1.2 * tau,
      pitch: 0.1 * Math.sin(1.9 * s + i) + (falling ? (i % 2 ? -3 : 2.4) * tau : 0), visible };
  });
}

// ---- the camera ------------------------------------------------------------------------------------------------
/** Offset o round a centre as (azimuth, elevation, distance), so a swing can arc round him. */
function sph(o: Vec3) { const h = Math.hypot(o.x, o.z); return { a: Math.atan2(o.x, o.z), e: Math.atan2(o.y, h), r: Math.hypot(h, o.y) }; }
function fromSph(a: number, e: number, r: number): Vec3 { return v3(Math.sin(a) * Math.cos(e) * r, Math.sin(e) * r, Math.cos(a) * Math.cos(e) * r); }

function shot1Camera(p: Plan, t: number): OpeningCamera {
  const h = heroAt(p, t).pos, u = clamp(t / 5, 0, 1);
  return {
    pos: v3(lerp(h.x, p.xLip, 0.4) + 0.35, p.H + 0.9 + 1.9 * u * u, h.z - 4.4 + 0.6 * u),
    look: v3(lerp(h.x, p.xLip, 0.5), p.H - 0.6 - 3.5 * u, h.z + 5 + 5 * u),
    fov: 55,
  };
}
/** Out past the lip, looking back at him. */
const frontSpot = (p: Plan) => v3(p.xLip + 3.2, p.H + 1.2, p.edgeZ + 6.4);

function cameraAt(p: Plan, t: number, end: OpeningCamera): OpeningCamera {
  if (t < 5) return shot1Camera(p, t);
  if (t < 7) {
    const h = heroAt(p, t).pos, F = frontSpot(p);
    const lookHero = v3(h.x, h.y + 0.2 - 0.6 * smooth(span(t, 6.35, 7)), h.z);
    const look = mix(shot1Camera(p, 5).look, lookHero, smooth(span(t, 5, 5.45)));
    if (t >= T.swingEnd) return { pos: v3(F.x, F.y - 1.4 * smooth(span(t, T.swingEnd, 7)), F.z), look, fov: 50 };
    // swing round the east side of him, arcing up and out, from behind him to out past the lip
    const c1 = shot1Camera(p, 5), a = sph(sub(c1.pos, heroAt(p, 5).pos)), b = sph(sub(F, heroAt(p, T.swingEnd).pos));
    const k = smooth(span(t, 5, T.swingEnd)), bump = Math.sin(Math.PI * k);
    let da = b.a - a.a; if (da > 0) da -= 2 * Math.PI;   // the long way round would pass west: keep east (decreasing)
    const o = fromSph(a.a + da * k, lerp(a.e, b.e, k) + 0.5 * bump, lerp(a.r, b.r, k) + 1.5 * bump);
    return { pos: add(h, o), look, fov: lerp(55, 50, k) };
  }
  if (t < T.impact) {
    const h = heroAt(p, t).pos, hold = smooth(span(t, 8.9, 9.5)), y = h.y + 3.4;
    return {
      pos: v3(h.x + 2.0, lerp(y, Math.max(y, 20), hold), h.z + 4.2 + 1.5 * hold),
      look: v3(h.x, h.y - 2.2 - 1.3 * hold, h.z - 0.6 * (1 - hold)),
      fov: 62,
    };
  }
  // shots 4 and 5: one move from the bank, following him ashore and settling into the game camera
  if (t >= OPENING_DURATION) return copyCam(end);
  const hp = heroAt(p, t).pos, follow = smooth(span(t, 11, 12.6));
  const anchor = v3(lerp(p.land.x, hp.x, follow), 0, lerp(p.land.z, hp.z, follow));
  const O = [v3(4.4, 1.4, 7.4), v3(4.0, 1.6, 6.6), v3(3.0, 2.4, 5.2)];
  const L = [v3(-0.6, 2.4, -1.4), v3(-0.6, 1.4, -0.8), v3(0.4, 0.3, 0.6)];
  const pick = (k: Vec3[]) => t < 11.5 ? mix(k[0]!, k[1]!, smooth(span(t, 10, 11.5))) : mix(k[1]!, k[2]!, smooth(span(t, 11.5, 13.5)));
  const w = smoother(span(t, 12.8, OPENING_DURATION));
  return { pos: mix(add(anchor, pick(O)), end.pos, w), look: mix(add(anchor, pick(L)), end.look, w), fov: lerp(50, end.fov, w) };
}

const copyCam = (c: OpeningCamera): OpeningCamera => ({ pos: { ...c.pos }, look: { ...c.look }, fov: c.fov });

function eventsAt(p: Plan, t: number): OpeningEvent[] {
  const list: { kind: OpeningEventKind; at: number; pos: () => Vec3 }[] = [
    { kind: 'tip', at: T.lip, pos: () => driftFall(p, p.sLip) },
    { kind: 'splash', at: T.impact, pos: () => v3(p.land.x, p.water, p.land.z) },
    { kind: 'surface', at: T.surface, pos: () => v3(p.surf.x, p.water, p.surf.z) },
    ...STROKES.map(at => ({ kind: 'stroke' as const, at, pos: () => ({ ...heroAt(p, at).pos, y: p.water }) })),
    { kind: 'ashore', at: T.edge, pos: () => v3(p.edge.x, p.water, p.edge.z) },
  ];
  return list.filter(e => e.at <= t).map(e => ({ kind: e.kind, at: e.at, age: t - e.at, pos: e.pos() }));
}

function shotOf(t: number): { shot: OpeningFrame['shot']; shotT: number } {
  let i = 0; while (i < 4 && t >= SHOT_START[i + 1]!) i++;
  return { shot: (i + 1) as OpeningFrame['shot'], shotT: span(t, SHOT_START[i]!, SHOT_START[i + 1]!) };
}

/** The whole cinematic at real time t (clamped to its length; any t past the end, Infinity included, is the final
 *  frame, which is what Skip shows). reduced: the short reduced-motion version. */
export function openingFrame(site: OpeningSite, end: OpeningCamera, t: number, reduced = false): OpeningFrame {
  const p = plan(site), dur = openingDuration(reduced);
  const tc = Number.isNaN(t) ? 0 : clamp(t, 0, dur), done = tc >= dur;
  if (reduced) {
    const ft = REDUCED_FROM + tc;                         // the full timeline's time
    return {
      t: tc, story: storyTime(ft), speed: 1, shot: 5, shotT: tc / dur, hero: heroAt(p, done ? OPENING_DURATION : ft),
      wreck: wreckAt(p, ft).map(w => ({ ...w, visible: false })), camera: copyCam(end), letterbox: 0,
      fade: 1 - smooth(span(tc, 0, 1.2)), mist: 0, streaks: 0, showWorld: true, showSet: false,
      events: eventsAt(p, ft).filter(e => e.at >= REDUCED_FROM), done,
    };
  }
  const camera = cameraAt(p, tc, end), deck = cloudDeckY(site);
  const inCloud = tc >= 5 && tc < T.impact ? clamp(1 - Math.abs(camera.pos.y - deck) / 5, 0, 1) : 0;
  return {
    t: tc, story: storyTime(tc), speed: storySpeed(tc), ...shotOf(tc),
    hero: heroAt(p, tc), wreck: wreckAt(p, tc), camera,
    letterbox: smooth(span(tc, 0, 0.8)) * (1 - smooth(span(tc, 14.8, OPENING_DURATION))),
    fade: 0, mist: 0.85 * smooth(inCloud), streaks: smooth(span(tc, 7, 7.4)) * (1 - smooth(span(tc, 9.3, 9.8))),
    showWorld: camera.pos.y < deck, showSet: tc < T.impact,
    events: eventsAt(p, tc), done,
  };
}

/** The game camera's spot as an OpeningCamera, for an orbit camera at (yaw, pitch in degrees, dist) round a
 *  point 1 m above `at` (render/camera.ts, OrbitCamera.follow). */
export function orbitCamera(at: Vec2, yaw = Math.PI / 2, pitchDeg = 38, dist = 13, fov = 50): OpeningCamera {
  const pr = pitchDeg * Math.PI / 180, look = v3(at.x, 1, at.z);
  return { pos: v3(look.x + Math.cos(pr) * Math.cos(yaw) * dist, look.y + Math.sin(pr) * dist, look.z + Math.cos(pr) * Math.sin(yaw) * dist), look, fov };
}
