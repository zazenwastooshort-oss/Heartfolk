// Taps, presses and drags on the scene (ui/gesture.ts says which is which): a tap sends a command (walk here, work this
// rock or tree, visit this building or land, gather these or pick this up; since chapter 2 fish here, pick these
// berries, fight a rat); a tap on one of the camp's buildings does what core/camp.ts campTap says (build it or carry on
// with it, look in the chest by day, to bed at night, cook, stack logs, practise), with its words under the mouse; a
// right click, or a long press on a phone with a ring filling round the finger as it is held, opens the camp's menu
// there (ui/campmenu.ts; the camp build, In 5: "right clicking the object"), and the browser's own menu never shows over
// the scene; a drag turns the camera (with either mouse button). Wheel and pinch zoom. Arrow keys turn the camera too.
import * as THREE from 'three';
import type { View } from '../render/view';
import type { Command } from '../systems/commands';
import type { GameState } from '../core/state';
import type { Layout } from '../world/layout';
import type { LineId } from '../data/building';
import type { CampMenu } from './campmenu';
import { RESOURCES, SKILLS } from '../data/skills';
import { GATHERS, PICKUPS } from '../data/pickups';
import { fightLabel } from '../core/targets';
import { campTap } from '../core/camp';
import { commandOf } from './campmenu';
import { Gestures, type Gesture, type PointerAt } from './gesture';

type Target =
  | { kind: 'node'; id: string; point: THREE.Vector3 }
  | { kind: 'pickup'; id: string; point: THREE.Vector3 }
  /** (chapter 2) a rat or a goblin, to fight */
  | { kind: 'fight'; id: string; point: THREE.Vector3 }
  /** one of the camp's spots, round what shows there (render/structures.ts, core/camp.ts tapBoxOf): its marker, or what
   *  is built or begun there */
  | { kind: 'camp'; spot: LineId; point: THREE.Vector3 }
  | { kind: 'building'; id: string; point: THREE.Vector3 }
  | { kind: 'parcel'; id: string; point: THREE.Vector3 }
  | { kind: 'ground'; point: THREE.Vector3 }
  | null;

/** What the scene's input calls out to: the words under the mouse ("Build|Campfire", or null over the grass), Look in
 *  the chest (the Backpack window at its section), and the camp's menu. */
export interface InputHooks {
  hover: (label: string | null) => void;
  openChest: () => void;
  menu: Pick<CampMenu, 'isOpen' | 'open' | 'close'>;
}

/** Whether an object is drawn: it and every parent visible. */
function shown(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** What `ray` meets of what is drawn under `roots` and shown, nearest first (not what is marked `noTap`: the ring round
 *  something under way lies on the grass round it). */
function meetsShown(ray: THREE.Raycaster, roots: readonly THREE.Object3D[]): THREE.Intersection[] {
  const out: THREE.Intersection[] = [];
  const visit = (o: THREE.Object3D) => {
    if (!o.visible || o.userData.noTap) return;
    o.raycast(ray, out);
    for (const c of o.children) visit(c);
  };
  for (const r of roots) if (shown(r)) visit(r);
  return out.sort((a, b) => a.distance - b.distance);
}

/** What a tap along `ray` is on: the nearest thing it meets that can be tapped (`hit`, or null), and the ground (null
 *  off it). The camp's tap areas are generous (round all of what shows at a spot and as tall as its tallest part:
 *  core/camp.ts tapBoxOf, render/structures.ts), so a big one (the log cabin's) covers on screen what stands near it,
 *  beside or behind its roof (the training dummy, a tree, a stone): a tap on one of the camp's buildings counts where
 *  the ray meets what is drawn there (`userData.drawn`), like a tap on anything else, the nearest first; only a ray
 *  meeting no building nor anything else, just the tap areas round them (the grass round a marker, beside a wall),
 *  goes to the spot whose middle it passes nearest, for the size of its area. Hidden things (something picked up, a
 *  spot with nothing at it) are still in the scene but can't be tapped. */
export function firstHit(ray: THREE.Raycaster, pickables: readonly THREE.Object3D[], ground: readonly THREE.Object3D[]):
  { hit: { object: THREE.Object3D; point: THREE.Vector3 } | null; ground: THREE.Intersection | null } {
  const floor = ray.intersectObjects(ground as THREE.Object3D[], false)[0] ?? null, limit = floor ? floor.distance + 0.01 : Infinity;
  let best: { object: THREE.Object3D; point: THREE.Vector3; distance: number } | null = null;
  const beside: THREE.Intersection[] = [];
  for (const h of ray.intersectObjects(pickables as THREE.Object3D[], false)) {
    if (h.distance > Math.min(limit, best?.distance ?? Infinity)) break;
    const u = h.object.userData;
    if ((u.pickupId || u.fightId || u.campSpot) && !shown(h.object)) continue;
    if (!u.campSpot) { best = h; continue; }
    const on = meetsShown(ray, (u.drawn as THREE.Object3D[] | undefined) ?? [])[0];
    if (on && on.distance <= limit) { if (!best || on.distance < best.distance) best = { object: h.object, point: on.point, distance: on.distance }; }
    else beside.push(h);
  }
  if (best) return { hit: best, ground: floor };
  let near: THREE.Intersection | null = null, nearest = Infinity;
  const bottom = new THREE.Vector3(), top = new THREE.Vector3();
  for (const h of beside) {
    const o = h.object;
    bottom.set(o.position.x, o.position.y - o.scale.y / 2, o.position.z); top.set(o.position.x, o.position.y + o.scale.y / 2, o.position.z);
    const off = Math.sqrt(ray.ray.distanceSqToSegment(bottom, top)) / Math.max(o.scale.x, 1e-6);
    if (off < nearest) { nearest = off; near = h; }
  }
  return { hit: near, ground: floor };
}

/** The ring's length round the held finger (index.html's #holdCue circle, r 20). */
const CUE_RING = 2 * Math.PI * 20;

export function bindInput(view: View, layout: Layout, queue: Command[], state: GameState, hooks: InputHooks): void {
  const el = view.renderer.domElement;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const gestures = new Gestures();
  // where the mouse is, so the hover text can follow a change under a still mouse (something picked up, the campfire
  // built on its spot): it is looked at again once a second while no button is down
  let mouse: { clientX: number; clientY: number } | null = null;
  // this press closed the camp's menu: it doesn't also walk him (a right click or a long press still opens another)
  let dismissed = false;
  // what a finger went down on, so the ring fills only where a long press opens a menu
  let held: Target = null;
  let watching = false;
  const cue = document.getElementById('holdCue'), cueFill = cue?.querySelector<SVGCircleElement>('.fill') ?? null;

  function pick(e: { clientX: number; clientY: number }): Target {
    const b = el.getBoundingClientRect();
    ndc.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1);
    ray.setFromCamera(ndc, view.cam.camera);
    const { hit, ground } = firstHit(ray, view.pickables, view.ground);
    if (hit) {
      const u = hit.object.userData;
      if (u.nodeId) {
        const spot = layout.nodes.find(n => n.id === u.nodeId);
        // a rock in land not yet claimed counts as the land itself
        if (spot?.parcel) return { kind: 'parcel', id: spot.parcel, point: hit.point };
        return { kind: 'node', id: u.nodeId, point: hit.point };
      }
      if (u.pickupId) return { kind: 'pickup', id: u.pickupId, point: hit.point };
      if (u.campSpot) return { kind: 'camp', spot: u.campSpot, point: hit.point };
      if (u.fightId) return { kind: 'fight', id: u.fightId, point: hit.point };
      if (u.buildingId) return { kind: 'building', id: u.buildingId, point: hit.point };
      if (u.parcelId) return { kind: 'parcel', id: u.parcelId, point: hit.point };
    }
    return ground ? { kind: 'ground', point: ground.point } : null;
  }

  function label(t: Target): string | null {
    if (!t || t.kind === 'ground') return null;
    if (t.kind === 'node') {
      // "Chop|Birch tree"; a fishing spot (chapter 2) has its own words, "Catch|Fish"
      const res = RESOURCES[layout.nodes.find(n => n.id === t.id)!.resource]!, words = res.hover;
      return words ? `${words.verb}|${words.name}` : `${SKILLS[res.skill].verb}|${res.name}`;
    }
    if (t.kind === 'pickup') {
      // what tapping it starts: gathering all of its group ("Gather|Planks"), or picking up just that one
      const def = PICKUPS[layout.pickups!.find(p => p.id === t.id)!.kind];
      return def.gather ? `${GATHERS[def.gather].verb ?? 'Gather'}|${GATHERS[def.gather].name}` : `Pick up|${def.name}`;
    }
    if (t.kind === 'camp') return campTap(state, layout, t.spot)?.hover ?? null;
    if (t.kind === 'fight') return fightLabel(layout, t.id);
    if (t.kind === 'building') return `Visit|${layout.buildings.find(b => b.id === t.id)!.name}`;
    return `Explore|${layout.parcels.find(p => p.id === t.id)!.name}`;
  }

  function hover(at: { clientX: number; clientY: number }): void {
    const l = label(pick(at));
    hooks.hover(l); el.style.cursor = l ? 'pointer' : 'default';
  }
  setInterval(() => { if (mouse && gestures.down === 0) hover(mouse); }, 1000);
  el.addEventListener('pointerleave', () => { mouse = null; });

  /** A tap on `t`: the command it sends. */
  function act(t: Target): void {
    if (!t) return;
    const at = { x: t.point.x, z: t.point.z };
    if (t.kind === 'camp') {
      const tap = campTap(state, layout, t.spot);
      if (tap?.action.kind === 'look') { hooks.openChest(); return; }
      const c = tap ? commandOf(tap.action) : null;
      if (c) { view.showMarker(t.point, true); queue.push(c); return; }
    }
    if (t.kind === 'node') { view.showMarker(t.point, true); queue.push({ type: 'work', nodeId: t.id }); }
    else if (t.kind === 'pickup') { view.showMarker(t.point, true); queue.push({ type: 'pickup', id: t.id }); }
    else if (t.kind === 'fight') { view.showMarker(t.point, true); queue.push({ type: 'fight', target: t.id }); }
    else if (t.kind === 'building') { view.showMarker(t.point, true); queue.push({ type: 'visit', id: t.id }); }
    else if (t.kind === 'parcel') { view.showMarker(t.point, true); queue.push({ type: 'visit', id: t.id, at }); }
    else { view.showMarker(t.point, false); queue.push({ type: 'walk', to: at }); }
  }

  /** Do what the presses say: turn, zoom, tap, or open the camp's menu (only on a building at the camp: a press held on
   *  anything else opens nothing, and sends nothing when it comes up). */
  function apply(out: Gesture[]): void {
    for (const g of out) {
      if (g.type === 'turn') { hooks.menu.close(); view.cam.turn(g.dx * 0.008, g.dy * 0.3); }   // the scene follows the finger sideways, as in most games
      else if (g.type === 'pinch') { hooks.menu.close(); view.cam.zoom(g.scale); }
      else if (g.type === 'tap') { if (!dismissed) act(pick({ clientX: g.x, clientY: g.y })); }
      else {
        const t = pick({ clientX: g.x, clientY: g.y });
        if (t?.kind === 'camp') hooks.menu.open(t.spot, { x: g.x, y: g.y });
      }
    }
  }

  /** The ring round a finger held on a building, filling as it is held (D24); hidden otherwise. */
  function showCue(now: number): void {
    if (!cue) return;
    const c = held?.kind === 'camp' ? gestures.cue(now) : null;
    cue.hidden = !c;
    if (!c) return;
    const b = el.getBoundingClientRect();
    cue.style.left = `${c.x - b.left}px`; cue.style.top = `${c.y - b.top}px`;
    cueFill?.style.setProperty('stroke-dashoffset', String(CUE_RING * (1 - c.progress)));
  }

  /** While a finger is held: the long press's time, and its ring. */
  function watchHold(): void {
    if (watching) return;
    watching = true;
    const frame = () => {
      const now = performance.now();
      apply(gestures.tick(now));
      showCue(now);
      if (gestures.down > 0 && gestures.pressAt && gestures.pressAt.kind !== 'mouse') requestAnimationFrame(frame);
      else { watching = false; if (cue) cue.hidden = true; }
    };
    requestAnimationFrame(frame);
  }

  const at = (e: PointerEvent): PointerAt => ({
    id: e.pointerId, kind: e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse',
    button: e.button, x: e.clientX, y: e.clientY, t: performance.now(),
  });
  el.addEventListener('pointerdown', e => {
    // (a pointer already gone by the time this runs can't be captured; the press still counts)
    try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    if (gestures.down === 0) { dismissed = hooks.menu.close(); held = e.pointerType === 'mouse' ? null : pick(e); }
    apply(gestures.start(at(e)));
    if (e.pointerType !== 'mouse') watchHold();
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') mouse = { clientX: e.clientX, clientY: e.clientY };
    if (!gestures.isDown(e.pointerId)) { if (gestures.down === 0) hover(e); return; }
    apply(gestures.move(at(e)));
  });
  el.addEventListener('pointerup', e => apply(gestures.end(at(e))));
  el.addEventListener('pointercancel', e => apply(gestures.cancel(at(e))));
  // the browser's own menu (a right click, or Android's after a long press) never shows over the scene
  el.addEventListener('contextmenu', e => { e.preventDefault(); apply(gestures.contextMenu()); });
  el.addEventListener('wheel', e => { e.preventDefault(); hooks.menu.close(); view.cam.zoom(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  window.addEventListener('keydown', e => {
    const k = ({ ArrowLeft: [0.08, 0], ArrowRight: [-0.08, 0], ArrowUp: [0, 3], ArrowDown: [0, -3] } as Record<string, [number, number]>)[e.key];
    if (k) { e.preventDefault(); hooks.menu.close(); view.cam.turn(k[0], k[1]); }
  });
}
