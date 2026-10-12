// Building it yourself (data/building.ts), the parts everyone reads: the simulation, the save, the Build list and the
// see-through copy he places. What is built in stages and how far along each is; where each stands (placed by the
// player on a half-metre grid, a quarter turn at a time, or at the tent's spot for the shelter's upgrades); whether a
// spot fits (on the camp's land, out of the water, clear of everything else, not on him, cutting nothing off); what
// the Build list has and what each still needs; which shelter stands and how well he rests in it; and the saved
// placements and progress, read back. Headless; changes nothing (systems/building.ts does the work).
import { owned, type GameState, type Placed } from './state';
import { inArea, siteOf, type Layout, type Site, type Vec2 } from '../world/layout';
import { blockedBy, landOf, navFor, type NavGrid, type PlacedRect } from '../world/nav';
import { waterOf } from '../world/water';
import { APRON, footOf, wallFootZ } from '../world/falls';
import { goblinCampBlocks } from '../world/goblincamp';
import { BUILD_REACH, MAKES, makeDef, type MakeDef, type MakeId, type SiteId } from '../data/making';
import { CARPENTRY, PLACE, SHELTERS, STAGED, type StagedDef } from '../data/building';
import { PICKUPS } from '../data/pickups';
import { SLEEP } from '../data/sleep';
import { levelFor } from '../data/xp';

/** Everything built in stages, in the Build list's order. */
export const STAGED_IDS = Object.keys(STAGED) as MakeId[];

/** The stages row for `id`, or null for something not built in stages. */
export const stagedDef = (id: string): StagedDef | null => Object.hasOwn(STAGED, id) ? STAGED[id as MakeId]! : null;

/** Whether `id` is something the player places himself (the log bench, the workbench). */
export const isPlaced = (id: string) => makeDef(id)?.at === 'placed' && !!stagedDef(id)?.size;

/** A quarter-turn count as radians round the vertical axis (0 faces south, as a building's rot). */
export const turnRot = (turn: number) => (((turn % 4) + 4) % 4) * Math.PI / 2;

/** A point snapped to the placing grid. */
export const snap = (p: Vec2): Vec2 => ({ x: Math.round(p.x / PLACE.grid) * PLACE.grid, z: Math.round(p.z / PLACE.grid) * PLACE.grid });

/** How `id` is in the way, placed `at`: its middle, turn, width and depth. */
export function rectOf(id: MakeId, at: Placed): PlacedRect | null {
  const size = stagedDef(id)?.size;
  return size ? { pos: { ...at.pos }, rot: turnRot(at.turn), w: size.w, d: size.d } : null;
}

/** What the player has placed, begun or built, as it is in the way (for navFor): in the Build list's order. */
export function placedRects(state: GameState): PlacedRect[] {
  return STAGED_IDS.flatMap(id => { const at = state.placed[id], r = at ? rectOf(id, at) : null; return r ? [r] : []; });
}

/** The walking grid with everything he has built and placed. */
export const walkGrid = (state: GameState, layout: Layout): NavGrid => navFor(layout, state.built, placedRects(state));

/** Where something built in stages stands, as a site: where he placed it (its ring reaching round its corners), or for
 *  the shelter's upgrades the tent's spot. Null when it has no place here (not placed, or no tent spot). */
export function buildSite(state: GameState, layout: Layout, id: MakeId): Site | null {
  const def = makeDef(id);
  if (!def || !stagedDef(id)) return null;
  if (def.at === 'placed') {
    const at = state.placed[id], r = at ? rectOf(id, at) : null;
    return r ? { pos: r.pos, rot: r.rot, w: r.w, d: r.d, radius: Math.hypot(r.w, r.d) / 2 } : null;
  }
  return def.at === 'here' ? null : siteOf(layout, def.at);
}

/** How far along something built in stages is, 0..1: 1 once built, 0 before it is begun. */
export function progressOf(state: GameState, id: MakeId): number {
  if (state.built.includes(id)) return 1;
  const worked = state.underway[id];
  return worked === undefined ? 0 : Math.min(1, worked / MAKES[id].time);
}

/** The stage it has reached (STAGE_NAMES): -1 before it is begun, 0 (footings) to CARPENTRY.stages - 1 while he works at
 *  it, CARPENTRY.stages once built. */
export function stageOf(state: GameState, id: MakeId): number {
  if (state.built.includes(id)) return CARPENTRY.stages;
  if (state.underway[id] === undefined) return -1;
  return Math.min(CARPENTRY.stages - 1, Math.floor(progressOf(state, id) * CARPENTRY.stages));
}

/** The stage reached after `worked` seconds at `id` (for systems/building.ts, to tell a stage going up). */
export const stageAt = (id: MakeId, worked: number) => Math.min(CARPENTRY.stages - 1, Math.floor(worked / MAKES[id].time * CARPENTRY.stages));

/** The best shelter that stands (the tent, the lean-to, the log hut), or null. */
export function bestShelter(state: GameState): MakeId | null {
  return [...SHELTERS].reverse().find(id => state.built.includes(id)) ?? null;
}

/** The shelter drawn at the tent's spot: an upgrade shows there in place of the one before it once its frame is up
 *  (during its footings the old one still stands inside the stakes). */
export function shelterShown(state: GameState): MakeId | null {
  return [...SHELTERS].reverse().find(id => stageOf(state, id) >= 1) ?? null;
}

/** How much more often gathering yields while he is well rested: more for a better shelter (data/building.ts). */
export function restBonus(state: GameState): number {
  const best = bestShelter(state);
  return (best && stagedDef(best)?.rest) || SLEEP.bonus;
}

/** What he still lacks to begin `def`: item id to how many more (empty when he has it all, carried or stored). */
export function lacking(state: GameState, def: MakeDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(def.needs)) { const have = owned(state, id); if (have < n) out[id] = n - have; }
  return out;
}

/** Whether this layout has a place for `id`: a camp for the things he places, the tent's spot for its upgrades. */
export function hasPlaceFor(layout: Layout, id: MakeId): boolean {
  const def = makeDef(id);
  if (!def || !stagedDef(id)) return false;
  return def.at === 'placed' ? !!layout.camp : def.at !== 'here' && !!siteOf(layout, def.at);
}

/** Whether the Build list has `id`: there is a place for it here, it isn't built, and what must stand first does
 *  (begun, it is listed whatever happens). */
export function unlocked(state: GameState, layout: Layout, id: MakeId): boolean {
  const staged = stagedDef(id);
  if (!staged || !hasPlaceFor(layout, id) || state.built.includes(id)) return false;
  return state.underway[id] !== undefined || staged.after.every(a => state.built.includes(a));
}

/** A row of the Build list: what it is, how far along, what it still needs to begin, and the Carpentry level. */
export interface BuildRow {
  id: MakeId; def: MakeDef; staged: StagedDef;
  /** begun: what it needed was taken; he carries on where he left off */
  begun: boolean; progress: number; stage: number;
  missing: Record<string, number>; levelOk: boolean;
}

/** What the Build list has: everything he can build here now, begun ones first. */
export function buildRows(state: GameState, layout: Layout): BuildRow[] {
  const level = levelFor(state.skills.carpentry ?? 0);
  return STAGED_IDS.filter(id => unlocked(state, layout, id)).map(id => {
    const def = MAKES[id], staged = STAGED[id]!, begun = state.underway[id] !== undefined;
    return { id, def, staged, begun, progress: progressOf(state, id), stage: stageOf(state, id), missing: begun ? {} : lacking(state, def), levelOk: begun || level >= staged.level };
  }).sort((a, b) => Number(b.begun) - Number(a.begun));
}

/** Whether the Build button shows: at a camp, once anything can be built (or has been begun or built). */
export const buildOpen = (state: GameState, layout: Layout) =>
  !!layout.camp && STAGED_IDS.some(id => unlocked(state, layout, id) || state.built.includes(id));

/** Why a spot doesn't fit (core/building.ts fitOf): off the camp's land, in or at the water, in the way of something
 *  (a structure or its spot, a tree, a rock, something on the ground, the rats' nest, the goblin camp), on him, or
 *  cutting off part of the camp (the way to the chest or the fire). */
export type Misfit = 'land' | 'water' | 'blocked' | 'him' | 'cutOff';

/** The corners and inside of a rect, every quarter metre or so, for testing the ground under it. */
function samples(r: PlacedRect): Vec2[] {
  const out: Vec2[] = [], c = Math.cos(r.rot), s = Math.sin(r.rot);
  const nx = Math.max(1, Math.ceil(r.w / 0.25)), nz = Math.max(1, Math.ceil(r.d / 0.25));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = (i / nx - 0.5) * r.w, lz = (j / nz - 0.5) * r.d;
    // from its own frame to the ground (the inverse of nav's into-the-frame turn)
    out.push({ x: r.pos.x + lx * c + lz * s, z: r.pos.z - lx * s + lz * c });
  }
  return out;
}

/** How far `p` is outside rect `r` (0 inside). */
function outside(r: PlacedRect, p: Vec2): number {
  const dx = p.x - r.pos.x, dz = p.z - r.pos.z, c = Math.cos(r.rot), s = Math.sin(r.rot);
  const lx = Math.abs(dx * c - dz * s) - r.w / 2, lz = Math.abs(dx * s + dz * c) - r.d / 2;
  return Math.hypot(Math.max(0, lx), Math.max(0, lz));
}

/** Whether two rects overlap, `gap` apart counting as touching (separating axes). */
function rectsMeet(a: PlacedRect, b: PlacedRect, gap: number): boolean {
  const axes = [a.rot, a.rot + Math.PI / 2, b.rot, b.rot + Math.PI / 2];
  const corners = (r: PlacedRect) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
    const lx = i! * r.w / 2, lz = j! * r.d / 2, c = Math.cos(r.rot), s = Math.sin(r.rot);
    return { x: r.pos.x + lx * c + lz * s, z: r.pos.z - lx * s + lz * c };
  });
  const ca = corners(a), cb = corners(b);
  for (const t of axes) {
    const ux = Math.cos(t), uz = -Math.sin(t);
    const pa = ca.map(p => p.x * ux + p.z * uz), pb = cb.map(p => p.x * ux + p.z * uz);
    if (Math.max(...pa) + gap < Math.min(...pb) || Math.max(...pb) + gap < Math.min(...pa)) return false;
  }
  return true;
}

/** The spots of this layout's fixed sites (the campfire's, the tent's, the chest's, the firewood pile's, the dummy's),
 *  built or not: something placed keeps clear of them all, and of the way to each. */
const SITES: SiteId[] = ['hearth', 'tent', 'chest', 'woodpile', 'dummy'];

/** What a placed thing must keep clear of in this layout, whatever he has done: circles and rects. */
function obstacles(state: GameState, layout: Layout, except: MakeId | null): { circles: [Vec2, number][]; rects: PlacedRect[] } {
  const circles: [Vec2, number][] = [
    ...layout.nodes.map(n => [n.pos, n.radius] as [Vec2, number]),
    ...layout.trees.map(t => [t.pos, (t.kind === 'oak' ? 0.4 : 0.3) * t.size] as [Vec2, number]),
    ...layout.bushes.map(b => [b, 0.45] as [Vec2, number]),
    // things on the ground (not the wreck's pieces already taken for good): they come back where they lay
    ...(layout.pickups ?? []).filter(x => state.taken[x.id] !== null).map(x => [x.pos, PICKUPS[x.kind].plant?.radius ?? 0.35] as [Vec2, number]),
    // the rats' nests and where the rats potter round them
    ...(layout.nests ?? []).map(n => [n.pos, n.radius + n.roam + PLACE.nest] as [Vec2, number]),
    ...(layout.goblinCamp ? [[layout.goblinCamp.pos, layout.goblinCamp.radius + PLACE.goblins] as [Vec2, number]] : []),
    ...goblinCampBlocks(layout).circles,
    ...layout.lanterns.map(l => [l, 0.2] as [Vec2, number]),
    ...layout.props.map(p => [p.pos, p.radius] as [Vec2, number]),
    ...(layout.debris ?? []).map(d => [d.pos, Math.max(0.3, d.radius)] as [Vec2, number]),
    ...footOf(layout).rocks.map(k => [k.pos, k.radius * 1.05] as [Vec2, number]),
    ...(layout.hearthModel !== null ? [[layout.hearth.pos, layout.hearth.radius] as [Vec2, number]] : []),
  ];
  const rects: PlacedRect[] = [
    ...layout.buildings.map(b => ({ pos: b.pos, rot: b.rot, w: b.w, d: b.d })),
    ...layout.gardens.map(g => ({ pos: g.pos, rot: g.rot, w: g.w + 0.6, d: g.d + 0.6 })),
    ...goblinCampBlocks(layout).rects.map(b => ({ pos: b.pos, rot: b.rot, w: b.hw * 2, d: b.hd * 2 })),
    ...STAGED_IDS.filter(id => id !== except).flatMap(id => { const at = state.placed[id], r = at ? rectOf(id, at) : null; return r ? [r] : []; }),
  ];
  const spots = siteShapes(layout);
  return { circles: [...circles, ...spots.circles], rects: [...rects, ...spots.rects] };
}

/** This layout's fixed spots (SITES), built or not, as circles and rects. */
function siteShapes(layout: Layout): { circles: [Vec2, number][]; rects: PlacedRect[] } {
  const circles: [Vec2, number][] = [], rects: PlacedRect[] = [];
  for (const id of SITES) {
    const site = siteOf(layout, id);
    if (!site) continue;
    if (site.w !== undefined && site.d !== undefined) rects.push({ pos: site.pos, rot: site.rot ?? 0, w: site.w, d: site.d });
    else circles.push([site.pos, site.radius]);
  }
  return { circles, rects };
}

/** Whether `r` can stand there at all: on the camp's land, out of the water, and not on one of the camp's fixed spots.
 *  The only checks a saved placement is held to (savedBuilding): the room placing keeps round things (PLACE) may be
 *  retuned, and things added to the camp, without taking away what a player has built. */
function hardMisfit(layout: Layout, r: PlacedRect): Misfit | null {
  const land = landOf(layout), water = waterOf(layout), under = samples(r);
  if (!layout.camp || under.some(p => !land.some(a => inArea(a, p)))) return 'land';
  if (under.some(p => water.edge(p) <= 0)) return 'water';
  const spots = siteShapes(layout);
  if (spots.circles.some(([c, rad]) => outside(r, c) < rad) || spots.rects.some(o => rectsMeet(r, o, 0))) return 'blocked';
  return null;
}

/** Whether `r` stands on open ground: on the layout's land, out of the water and off the scree, clear of everything in
 *  the layout and of what else he has placed, with room to spare (PLACE). */
function groundMisfit(state: GameState, layout: Layout, r: PlacedRect, except: MakeId | null): Misfit | null {
  const land = landOf(layout), water = waterOf(layout), falls = layout.falls, under = samples(r);
  if (!layout.camp || under.some(p => !land.some(a => inArea(a, p)))) return 'land';
  if (falls && under.some(p => p.z < wallFootZ(falls, p.x) + APRON)) return 'land';
  if (under.some(p => water.edge(p) < PLACE.water)) return 'water';
  const { circles, rects } = obstacles(state, layout, except);
  if (circles.some(([c, rad]) => outside(r, c) < rad + PLACE.gap)) return 'blocked';
  if (rects.some(o => rectsMeet(r, o, PLACE.gap))) return 'blocked';
  return null;
}

/** Whether something built here can still be reached: a spot to stand beside it (where he stands to build or use it)
 *  that he can walk to. */
function reachableSite(site: Site, nav: NavGrid, reach: (p: Vec2) => boolean): boolean {
  const out = site.radius + BUILD_REACH;
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, p = { x: site.pos.x + Math.cos(a) * out, z: site.pos.z + Math.sin(a) * out };
    if (nav.walkable(p) && reach(p)) return true;
  }
  return false;
}

/** Whether `id` fits placed at `pos` (snapped to the grid) turned `turn` quarter turns: null when it does, else why
 *  not. Besides open ground (groundMisfit), it mustn't be on him, and mustn't cut him off from any part of the camp: no
 *  more than a sliver of open ground he can reach now may be lost (PLACE.pocket), and he must still reach the camp's
 *  spots (the fire, the chest, the shelter, the firewood pile, the dummy) and everything else built in stages. */
export function fitOf(state: GameState, layout: Layout, id: MakeId, pos: Vec2, turn: number): Misfit | null {
  const r = rectOf(id, { pos: snap(pos), turn });
  if (!r || !isPlaced(id)) return 'land';
  const ground = groundMisfit(state, layout, r, id);
  if (ground) return ground;
  const him = state.player.pos;
  if (outside(r, him) < PLACE.him) return 'him';
  const nav = walkGrid(state, layout), also = (p: Vec2) => blockedBy(r, p);
  const { lost, before, after } = nav.cutOff(him, also);
  if (lost > PLACE.pocket) return 'cutOff';
  const sites = [...SITES.map(s => siteOf(layout, s)), ...STAGED_IDS.filter(x => x !== id).map(x => state.placed[x] || state.underway[x] !== undefined ? buildSite(state, layout, x) : null)];
  for (const site of sites) if (site && reachableSite(site, nav, before) && !reachableSite(site, nav, after)) return 'cutOff';
  return null;
}

/** Whether a copy at `p` can be seen from `camera` (where the camera is): nothing standing (one of the camp's spots, or
 *  something placed, a little wider than its footprint: PLACE.eaves) on the ground just before it on the camera's side
 *  (PLACE.sight), where it would hide it. */
export function inSight(state: GameState, layout: Layout, p: Vec2, camera: Vec2): boolean {
  const dx = camera.x - p.x, dz = camera.z - p.z, d = Math.hypot(dx, dz) || 1, rects = placedRects(state);
  const spots = SITES.flatMap(id => { const site = siteOf(layout, id); return site ? [site] : []; });
  for (let t = 0.25; t <= Math.min(d, PLACE.sight); t += 0.25) {
    const q = { x: p.x + dx / d * t, z: p.z + dz / d * t };
    if (spots.some(s => Math.hypot(q.x - s.pos.x, q.z - s.pos.z) < s.radius + PLACE.eaves) || rects.some(r => outside(r, q) < PLACE.eaves)) return false;
  }
  return true;
}

/** Where a new see-through copy of `id` starts: beside him, to the right as seen from `camera` (where the camera is), so
 *  it is in sight and not hidden behind him; the nearest spot round there where it fits and nothing hides it (the hut,
 *  say), else the nearest where it fits, if there is one close by, else right there. On the grid. */
export function placeStart(state: GameState, layout: Layout, id: MakeId, camera: Vec2): Vec2 {
  const p = state.player.pos, dx = p.x - camera.x, dz = p.z - camera.z, d = Math.hypot(dx, dz) || 1;
  const base = snap({ x: p.x - dz / d * PLACE.ahead, z: p.z + dx / d * PLACE.ahead });
  let hidden: Vec2 | null = null;
  for (let ring = 0; ring <= 6; ring++) {
    for (let k = 0; k < Math.max(1, ring * 6); k++) {
      const a = k / Math.max(1, ring * 6) * Math.PI * 2, at = snap({ x: base.x + Math.cos(a) * ring * PLACE.grid, z: base.z + Math.sin(a) * ring * PLACE.grid });
      const seen = inSight(state, layout, at, camera);
      if ((seen || !hidden) && !fitOf(state, layout, id, at, 0)) { if (seen) return at; hidden = at; }
    }
  }
  return hidden ?? base;
}

/** A saved game's placements and building under way, read back (core/save.ts): a placement for something placeable that
 *  is begun or built, with a finite spot where it can stand at all (hardMisfit: the layout may have changed, but the room
 *  placing keeps round things isn't asked for again) and a whole quarter-turn count;
 *  progress for something begun and not built, a number from 0 up to its time, with its place here (a placement, or
 *  the shelter it upgrades standing). Something built whose placement is lost is no longer built. A save from before
 *  this has none of it. */
export function savedBuilding(data: { placed?: unknown; underway?: unknown }, state: GameState, layout: Layout): Pick<GameState, 'placed' | 'underway' | 'built'> {
  const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {});
  const savedPlaced = rec(data.placed), savedUnderway = rec(data.underway);
  const placed: GameState['placed'] = {}, underway: GameState['underway'] = {};
  for (const id of STAGED_IDS) {
    const def = MAKES[id], staged = STAGED[id]!, built = state.built.includes(id);
    const worked = savedUnderway[id];
    const begun = !built && typeof worked === 'number' && Number.isFinite(worked) && worked >= 0 && worked < def.time;
    if (isPlaced(id)) {
      const at = rec(savedPlaced[id]), pos = rec(at.pos);
      const ok = (built || begun) && Number.isFinite(pos.x) && Number.isFinite(pos.z) && Number.isSafeInteger(at.turn) && (at.turn as number) >= 0 && (at.turn as number) < 4;
      const spot: Placed = { pos: { x: pos.x as number, z: pos.z as number }, turn: at.turn as number };
      if (!ok || hardMisfit(layout, rectOf(id, spot)!)) continue;
      placed[id] = spot;
      if (begun) underway[id] = worked as number;
    } else if (begun && hasPlaceFor(layout, id) && (!staged.upgrades || state.built.includes(staged.upgrades))) underway[id] = worked as number;
  }
  const built = state.built.filter(id => !isPlaced(id) || !!placed[id]);
  return { placed, underway, built };
}
