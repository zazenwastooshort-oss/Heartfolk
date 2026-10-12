// Chapter 2's placeholder models for the later chunks (src/render/creatures.ts, gear.ts, props.ts): each builds headless
// without throwing and is made of meshes; the poses move the rat and the goblin as they should and keep them on the
// ground; their bites and swings keep to the caller's attack clock; the hide armour goes on the right bones and comes
// off again; the armour and the props are merged into one mesh per colour; the goblin and the hide tent are copies that
// leave the character's and the shelter's own materials alone. Loads the real assets/models/*.glb.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { goblinModel, ratModel, GOBLIN, RAT, type GoblinPose, type RatPose } from '../src/render/creatures';
import { GEAR, wearGear, type GearId } from '../src/render/gear';
import { hideTentModel, palisadeModel, ratNestModel, totemModel, PROP_LOOK } from '../src/render/props';
import { showcaseWanted } from '../src/render/showcase';

const glb = (name: string): Promise<GLTF> => {
  const b = readFileSync(new URL(`../assets/models/${name}`, import.meta.url));
  return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '');
};
const meshes = (o: THREE.Object3D) => { let n = 0; o.traverse(m => { if ((m as THREE.Mesh).isMesh) n++; }); return n; };
/** The different materials o's meshes are drawn with. */
const materials = (o: THREE.Object3D) => {
  const all = new Set<THREE.MeshStandardMaterial>();
  o.traverse(m => { if ((m as THREE.Mesh).isMesh) all.add((m as THREE.Mesh).material as THREE.MeshStandardMaterial); });
  return all;
};
/** The box round everything shown, in world space (hidden parts left out). */
function box(o: THREE.Object3D): THREE.Box3 {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3();
  const visit = (x: THREE.Object3D) => {
    if (!x.visible) return;
    if ((x as THREE.Mesh).isMesh) b.expandByObject(x, false);
    x.children.forEach(visit);
  };
  visit(o);
  return b;
}
const finite = (b: THREE.Box3) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite);
const worldY = (o: THREE.Object3D) => { o.updateWorldMatrix(true, false); return o.getWorldPosition(new THREE.Vector3()).y; };

describe('the rat', () => {
  /** Run `pose` for `seconds` at 30 frames a second from time t0; the box round it at the end. */
  const run = (rat: ReturnType<typeof ratModel>, pose: RatPose, seconds: number, t0 = 0) => {
    for (let i = 1; i <= seconds * 30; i++) rat.update(pose, t0 + i / 30, 1 / 30);
    return box(rat.group);
  };

  it('is built of meshes and stays finite and on the ground in every pose', () => {
    const rat = ratModel(2);
    expect(meshes(rat.group)).toBeGreaterThan(10);
    for (const pose of ['idle', 'scurry', 'bite', 'down'] as RatPose[]) {
      const b = run(rat, pose, 1.5);
      expect(finite(b), pose).toBe(true);
      expect(b.min.y, pose).toBeGreaterThan(-0.06);
      expect(b.max.y, pose).toBeLessThan(0.6);
    }
  });

  it('lunges forward when it bites, and rolls onto its side once knocked over', () => {
    const rat = ratModel(1), body = rat.group.getObjectByName('rat_body')!;
    /** How upright its body is: 1 standing, 0 on its side. */
    const upright = () => { rat.group.updateMatrixWorld(true); return new THREE.Vector3(0, 1, 0).applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion())).y; };
    const idle = run(rat, 'idle', 1);
    expect(upright()).toBeGreaterThan(0.95);
    let reach = -Infinity;
    for (let i = 1; i <= 30; i++) { rat.update('bite', 1 + i / 30, 1 / 30); reach = Math.max(reach, box(rat.group).max.x); }
    expect(reach).toBeGreaterThan(idle.max.x + 0.05);
    run(rat, 'down', 1.5, 3);
    expect(upright()).toBeLessThan(0.2);
    run(rat, 'idle', 1.5, 5);                                  // and gets back up
    expect(upright()).toBeGreaterThan(0.95);
  });

  it('keeps to the attack clock it is given: one bite striking at RAT.biteStrike, then still and ready until the next', () => {
    const rat = ratModel(1);
    run(rat, 'idle', 1);
    /** Bites on the clock, `every` seconds apart, at 60 frames a second from a new bite: how far forward its snout is
     *  each frame (frame k at attackT k / 60). */
    let t = 1;
    const bites = (every: number, seconds: number) => {
      const reach: number[] = [];
      for (let k = 0; k < seconds * 60; k++) { rat.update('bite', (t += 1 / 60), 1 / 60, undefined, (k / 60) % every); reach.push(box(rat.group).max.x); }
      return reach;
    };
    const slow = bites(2.4, 2.4), at = (s: number) => slow[Math.round(s * 60)]!, rest = slow[slow.length - 1]!;
    expect(slow.indexOf(Math.max(...slow)) / 60).toBeCloseTo(RAT.biteStrike, 1);           // strikes on time...
    expect(at(RAT.biteStrike - RAT.bite.snap)).toBeLessThan(rest);                         // ...reared back just before
    expect(at(RAT.biteStrike)).toBeGreaterThan(rest + 0.05);                               // and snapping as quick as ever
    const settled = slow.slice(Math.ceil((RAT.bite.rear + RAT.bite.snap + RAT.bite.settle + 0.1) * 60));
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(0.003);               // then still till the next
    const next = bites(2.4, 0.8);
    expect(next.indexOf(Math.max(...next)) / 60).toBeCloseTo(RAT.biteStrike, 1);           // which strikes on time too
  });
});

describe('the goblin', () => {
  it('is a smaller, green copy of the character with a club, leaving the character as he was', async () => {
    const gltf = await glb('miner.glb');
    const skin = ((gltf.scene.getObjectByName('face') as THREE.Mesh).material as THREE.MeshStandardMaterial).color.clone();
    const goblin = goblinModel(gltf);
    expect(meshes(goblin.group)).toBeGreaterThan(20);
    const face = goblin.group.getObjectByName('face') as THREE.Mesh, green = (face.material as THREE.MeshStandardMaterial).color;
    expect(green.g).toBeGreaterThan(green.r);
    expect((gltf.scene.getObjectByName('face') as THREE.Mesh).material).not.toBe(face.material);
    expect(((gltf.scene.getObjectByName('face') as THREE.Mesh).material as THREE.MeshStandardMaterial).color.equals(skin)).toBe(true);
    for (const name of ['pick_head', 'axe_blade', 'pick_handle']) expect(goblin.group.getObjectByName(name)!.visible, name).toBe(false);
    // the club rides on the tool's bone, merged into a mesh per colour; nothing was added to the character
    const club = goblin.group.getObjectByName('club')!;
    expect(club.parent!.name).toBe('tool');
    expect(meshes(club)).toBe(materials(club).size);
    expect(gltf.scene.getObjectByName('Miner')!.parent).toBe(gltf.scene);
    expect(gltf.scene.getObjectByName('club')).toBeUndefined();
    const tall = box(goblin.group).max.y;
    expect(tall).toBeGreaterThan(1.2);
    expect(tall).toBeLessThan(1.6);                              // about 0.8 of the character's 1.71 m
  });

  it('needs miner.glb loaded for the goblins, not the view\'s load (whose Miner is the player)', async () => {
    const gltf = await glb('miner.glb'), miner = gltf.scene.getObjectByName('Miner')!;
    new THREE.Scene().add(miner);                              // as the view does with its load
    expect(() => goblinModel(gltf)).toThrow(/loaded for the goblins/);
    expect(() => goblinModel({ scene: miner, animations: gltf.animations })).toThrow(/loaded for the goblins/);
  });

  it('plays only clips miner.glb has', async () => {
    const names = (await glb('miner.glb')).animations.map(c => c.name);
    for (const [pose, clip] of Object.entries(GOBLIN.clips)) expect(names, pose).toContain(clip);
  });

  it('swings his club when attacking, held to the attack clock it is given, and on and on without one', async () => {
    const gltf = await glb('miner.glb'), goblin = goblinModel(gltf);
    const chop = goblin.mixer.existingAction(gltf.animations.find(c => c.name === GOBLIN.clips.attack)!)!;
    const club = goblin.group.getObjectByName('club')!;
    let t = 0;
    for (let i = 0; i < 30; i++) goblin.update('idle', (t += 1 / 30), 1 / 30);
    // on the clock: the blow lands at GOBLIN.attackImpact, Chop alone playing and the club out in front of him
    const frames = Math.round(GOBLIN.attackImpact * 30);
    for (let i = 1; i <= frames; i++) goblin.update('attack', (t += 1 / 30), 1 / 30, undefined, i / frames * GOBLIN.attackImpact);
    expect(chop.time).toBeCloseTo(GOBLIN.attackImpact, 5);
    expect(chop.getEffectiveWeight()).toBeCloseTo(1, 5);
    expect(club.visible).toBe(true);
    goblin.group.updateMatrixWorld(true);
    const tip = club.localToWorld(new THREE.Vector3(0, GOBLIN.club.to, 0));
    expect(tip.x).toBeGreaterThan(0.85);                         // he faces +x: about 1.0 m in front...
    expect(tip.x).toBeLessThan(1.15);
    expect(tip.y).toBeGreaterThan(0.7);                          // ...and 0.85 m up
    expect(tip.y).toBeLessThan(1.0);
    // past the swing's end he holds still at it, however long the clock runs
    for (let i = 0; i < 10; i++) goblin.update('attack', (t += 1 / 30), 1 / 30, undefined, 3 + i / 30);
    expect(chop.time).toBeCloseTo(chop.getClip().duration, 5);
    // with no clock the swing plays on by itself
    const was = chop.time;
    goblin.update('attack', (t += 1 / 30), 1 / 30);
    expect(chop.time).not.toBeCloseTo(was, 3);
  });

  it('plays every pose, falls on his back when knocked over and gets up again', async () => {
    const goblin = goblinModel(await glb('miner.glb'));
    const head = goblin.group.getObjectByName('head')!, club = goblin.group.getObjectByName('club')!;
    let t = 0;
    const run = (pose: GoblinPose, seconds: number) => { for (let i = 0; i < seconds * 30; i++) goblin.update(pose, (t += 1 / 30), 1 / 30); };
    for (const pose of ['idle', 'walk', 'attack', 'idle'] as GoblinPose[]) {
      run(pose, 1.2);
      expect(finite(box(goblin.group)), pose).toBe(true);
      expect(worldY(head), pose).toBeGreaterThan(0.9);
    }
    let lowest = Infinity;
    for (let i = 0; i < 1.2 * 30; i++) { goblin.update('down', (t += 1 / 30), 1 / 30); lowest = Math.min(lowest, box(goblin.group).min.y); }
    expect(worldY(head)).toBeLessThan(0.4);
    expect(lowest).toBeGreaterThan(-0.02);                       // lying on the ground, nothing sunk into it all the way down
    expect(club.visible).toBe(false);                            // the club is under him
    run('idle', 1.2);
    expect(worldY(head)).toBeGreaterThan(0.9);
    expect(club.visible).toBe(true);                             // and on his back again
  });
});

describe('hide armour', () => {
  it('goes on the right bones, shows only what he wears, and is built once', async () => {
    const miner = (await glb('miner.glb')).scene.getObjectByName('Miner')!;
    const all: GearId[] = ['hide_cap', 'hide_vest', 'hide_shield'];
    wearGear(miner, all);
    for (const id of all) {
      const piece = miner.getObjectByName(`gear:${id}`)!;
      expect(piece.parent!.name, id).toBe(GEAR[id].bone);
      expect(piece.visible, id).toBe(true);
      expect(meshes(piece), id).toBeGreaterThan(2);
    }
    wearGear(miner, ['hide_cap', 'a_sword_not_drawn_yet']);
    expect(all.map(id => miner.getObjectByName(`gear:${id}`)!.visible)).toEqual([true, false, false]);
    wearGear(miner, []);
    expect(all.map(id => miner.getObjectByName(`gear:${id}`)!.visible)).toEqual([false, false, false]);
    wearGear(miner, all);
    let pieces = 0;
    miner.traverse(o => { if (o.name.startsWith('gear:')) pieces++; });
    expect(pieces).toBe(3);
  });

  it('is merged into a mesh per colour, its materials shared by everyone who wears it', async () => {
    const gltf = await glb('miner.glb'), miner = gltf.scene.getObjectByName('Miner')!;
    const bare = meshes(miner), all: GearId[] = ['hide_cap', 'hide_vest', 'hide_shield'];
    wearGear(miner, all);
    expect(meshes(miner) - bare).toBeLessThanOrEqual(10);       // the whole armour, every stitch included
    for (const id of all) {
      const piece = miner.getObjectByName(`gear:${id}`)!;
      expect(meshes(piece), id).toBe(materials(piece).size);
    }
    const goblin = goblinModel(await glb('miner.glb'));
    wearGear(goblin.group, all);
    const of = (o: THREE.Object3D) => all.flatMap(id => [...materials(o.getObjectByName(`gear:${id}`)!)]);
    const theirs = of(miner), his = of(goblin.group);
    expect(his.length).toBe(theirs.length);
    his.forEach((m, i) => expect(m).toBe(theirs[i]));           // the very same materials, not copies
  });

  it('sits where it should on him at rest: the cap on his head, the vest round his chest, the shield on his left arm', async () => {
    const miner = (await glb('miner.glb')).scene.getObjectByName('Miner')!;
    wearGear(miner, ['hide_cap', 'hide_vest', 'hide_shield']);
    const at = (id: GearId) => box(miner.getObjectByName(`gear:${id}`)!);
    const headY = worldY(miner.getObjectByName('head')!), hipsY = worldY(miner.getObjectByName('hips')!);
    const cap = at('hide_cap'), vest = at('hide_vest'), shield = at('hide_shield');
    expect(cap.min.y).toBeGreaterThan(headY - 0.05);             // above his eyes and ears
    expect(cap.max.y).toBeGreaterThan(headY + 0.25);             // over the top of his hair
    expect(cap.max.y).toBeLessThan(headY + 0.35);
    expect(vest.min.y).toBeGreaterThan(hipsY);
    expect(vest.max.y).toBeLessThan(hipsY + 0.6);
    expect(vest.max.z - vest.min.z).toBeGreaterThan(0.47);       // round his chest, 0.46 m across at its widest
    expect(shield.getCenter(new THREE.Vector3()).z).toBeLessThan(-0.2);      // his left is -z (he faces +x)
    expect(shield.max.x - shield.min.x).toBeGreaterThan(0.2);   // turned a little to the front, so seen from there
  });
});

describe('the props', () => {
  it('build from meshes at a sensible size', () => {
    const nest = box(ratNestModel()), fence = box(palisadeModel(3)), totem = box(totemModel());
    for (const b of [nest, fence, totem]) { expect(finite(b)).toBe(true); expect(b.min.y).toBeGreaterThan(-0.05); }
    expect(nest.max.x - nest.min.x).toBeGreaterThan(0.9);
    expect(nest.max.y).toBeLessThan(0.5);
    expect(fence.max.x - fence.min.x).toBeGreaterThan(2.8);
    expect(fence.max.x - fence.min.x).toBeLessThan(3.3);
    expect(fence.max.y).toBeGreaterThan(1.6);
    expect(totem.max.y).toBeGreaterThan(2);
  });

  it('are merged into a mesh per colour, however many stakes, twigs and tufts', () => {
    for (const g of [ratNestModel(), palisadeModel(), palisadeModel(6), totemModel()]) {
      expect(meshes(g)).toBe(materials(g).size);
      expect(meshes(g)).toBeLessThanOrEqual(6);
    }
    expect(meshes(palisadeModel(6))).toBe(meshes(palisadeModel(2.4)));
  });

  it('turns village.glb\'s Tent into hides without changing the shelter\'s tent', async () => {
    const village = (await glb('village.glb')).scene, shelter = materials(village.getObjectByName('Tent')!);
    const colours = new Map([...shelter].map(m => [m, m.color.clone()]));
    const tent = hideTentModel(village), ours = materials(tent);
    expect([...ours].filter(m => shelter.has(m))).toEqual([]);                    // its own materials...
    for (const [m, colour] of colours) expect(m.color.equals(colour)).toBe(true); // ...and the shelter's as they were
    expect([...ours].some(m => m.color.equals(new THREE.Color(PROP_LOOK.hide)))).toBe(true);
    expect(meshes(tent)).toBe(ours.size);
    expect(meshes(tent)).toBeLessThan(10);
  });
});

describe('the dev preview', () => {
  it('shows only with ?models in the address', () => {
    expect(showcaseWanted('?models')).toBe(true);
    expect(showcaseWanted('?x=1&models')).toBe(true);
    expect(showcaseWanted('?models=1')).toBe(true);
    expect(showcaseWanted('')).toBe(false);
    expect(showcaseWanted('?model')).toBe(false);
    expect(showcaseWanted('?modelsx')).toBe(false);
  });
});
