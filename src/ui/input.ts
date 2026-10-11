// Taps and drags on the scene: a tap sends a command (walk here, work this rock or tree, visit this building or land);
// a drag turns the camera. Wheel and pinch zoom. Arrow keys turn the camera too.
import * as THREE from 'three';
import type { View } from '../render/view';
import type { Command } from '../systems/commands';
import type { Layout } from '../world/layout';
import { RESOURCES, SKILLS } from '../data/skills';

type Target =
  | { kind: 'node'; id: string; point: THREE.Vector3 }
  | { kind: 'building'; id: string; point: THREE.Vector3 }
  | { kind: 'parcel'; id: string; point: THREE.Vector3 }
  | { kind: 'ground'; point: THREE.Vector3 }
  | null;

export function bindInput(view: View, layout: Layout, queue: Command[], onHover: (label: string | null) => void): void {
  const el = view.renderer.domElement;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pointers = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number } | null = null, pinchD = 0;

  function pick(e: PointerEvent): Target {
    const b = el.getBoundingClientRect();
    ndc.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1);
    ray.setFromCamera(ndc, view.cam.camera);
    const hit = ray.intersectObjects(view.pickables, false)[0];
    const ground = ray.intersectObjects(view.ground, false)[0];
    if (hit && (!ground || hit.distance <= ground.distance + 0.01)) {
      const u = hit.object.userData;
      if (u.nodeId) {
        const spot = layout.nodes.find(n => n.id === u.nodeId);
        // a rock in land not yet claimed counts as the land itself
        if (spot?.parcel) return { kind: 'parcel', id: spot.parcel, point: hit.point };
        return { kind: 'node', id: u.nodeId, point: hit.point };
      }
      if (u.buildingId) return { kind: 'building', id: u.buildingId, point: hit.point };
      if (u.parcelId) return { kind: 'parcel', id: u.parcelId, point: hit.point };
    }
    return ground ? { kind: 'ground', point: ground.point } : null;
  }

  function label(t: Target): string | null {
    if (!t || t.kind === 'ground') return null;
    if (t.kind === 'node') {
      const res = RESOURCES[layout.nodes.find(n => n.id === t.id)!.resource]!;
      return `${SKILLS[res.skill].verb}|${res.name}`;
    }
    if (t.kind === 'building') return `Visit|${layout.buildings.find(b => b.id === t.id)!.name}`;
    return `Explore|${layout.parcels.find(p => p.id === t.id)!.name}`;
  }

  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    down = pointers.size === 1 ? { x: e.clientX, y: e.clientY } : null;
  });
  el.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      const t = pick(e), l = label(t);
      onHover(l); el.style.cursor = l ? 'pointer' : 'default';
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      view.cam.turn((e.clientX - prev.x) * 0.008, (e.clientY - prev.y) * 0.3);   // the scene follows the finger sideways, as in most games
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down = null;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD) view.cam.zoom(d / pinchD);
      pinchD = d; down = null;
    }
  });
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchD = 0;
    if (!down || e.type === 'pointercancel') return;
    const t = pick(e); down = null;
    if (!t) return;
    const at = { x: t.point.x, z: t.point.z };
    if (t.kind === 'node') { view.showMarker(t.point, true); queue.push({ type: 'work', nodeId: t.id }); }
    else if (t.kind === 'building') { view.showMarker(t.point, true); queue.push({ type: 'visit', id: t.id }); }
    else if (t.kind === 'parcel') { view.showMarker(t.point, true); queue.push({ type: 'visit', id: t.id, at }); }
    else { view.showMarker(t.point, false); queue.push({ type: 'walk', to: at }); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => { e.preventDefault(); view.cam.zoom(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  window.addEventListener('keydown', e => {
    const k = ({ ArrowLeft: [0.08, 0], ArrowRight: [-0.08, 0], ArrowUp: [0, 3], ArrowDown: [0, -3] } as Record<string, [number, number]>)[e.key];
    if (k) { e.preventDefault(); view.cam.turn(k[0], k[1]); }
  });
}
