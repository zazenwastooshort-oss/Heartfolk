// Discovering things (Discovery, game 0.0.38; the owner, 13 Oct 2026: "as u click an object thats when u discover it and
// at that point u can access recepies so its really like a tree"; the brief's In 3 and D1): the first tap on anything in
// the world discovers what it names, the thing and what it gives, even before he can use it (a copper rock before the
// pickaxe: copper ore), when the command for the tap is applied (systems/commands.ts), never by the UI and never by
// hovering. And whatever comes into his hands another way (a rat's hide, a cooked fish, the chief's map), or he makes or
// builds, is discovered too: each step looks at what he holds (core/discovery.ts heldThings: small sets, so it is
// cheap). Each new one is added to GameState.discovered and told by a 'discovered' event, once ever. Only at the camp,
// as his thoughts and his book were (the village has no Discovery).
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import type { Command } from './commands';
import { discoveredSet, FOE_GIVES, heldThings } from '../core/discovery';
import { foeKind, targetOf } from '../core/targets';
import { FIRES, isNode } from '../data/discovery';
import { RESOURCES } from '../data/skills';
import { PICKUPS } from '../data/pickups';
import { COOK } from '../data/cooking';
import { makeDef } from '../data/making';

/** Discovers `id` if it is a node he hasn't found yet: added at the end of what he has found, and told. */
export function discover(state: GameState, id: string, events: EventBus): void {
  if (!isNode(id) || discoveredSet(state).has(id)) return;
  state.discovered.push(id);
  events.emit({ type: 'discovered', id });
}

/** What a tap's command names (D1): working a node, what it gives (a birch tree: birch logs; a copper rock: copper ore;
 *  the ripples: raw fish); picking something up, what it gives (a plank or the smashed crate: planks; a berry bush:
 *  berries; the book: nothing here); fighting, the training dummy itself while it is there to practise on, and a
 *  creature what it gives whether or not it can be fought just now: a rat its hide, a goblin or the goblin chief (out,
 *  or in his tent: a tap on the tent is a tap on him) the torn map their camp is beaten for; visiting or building one
 *  of the camp's things, that thing (the chest, the firewood pile, a marker's thing); cooking at the fire, the fire
 *  that stands and cooked fish. Nothing for the rest (a walk, eating, the goal's next step itself: the commands it
 *  sends name their own things). */
export function tappedThings(state: GameState, layout: Layout, c: Command): string[] {
  switch (c.type) {
    case 'work': {
      const node = layout.nodes.find(n => n.id === c.nodeId), res = node && RESOURCES[node.resource];
      return res ? [res.item] : [];
    }
    case 'pickup': {
      const spot = (layout.pickups ?? []).find(p => p.id === c.id), gives = spot && PICKUPS[spot.kind].gives;
      return gives && gives !== 'book' ? [gives.item] : [];
    }
    case 'fight': {
      if (c.target === 'dummy') return targetOf(state, layout, c.target) ? ['dummy'] : [];
      const kind = foeKind(layout, c.target);
      return kind ? [FOE_GIVES[kind]] : [];
    }
    case 'visit': return makeDef(c.id) ? [c.id] : [];
    case 'build': return [c.id];
    case 'cook': {
      const fires = FIRES.filter(f => state.built.includes(f));
      return fires.length ? [...fires, COOK.cooked] : [];
    }
    default: return [];
  }
}

/** The first tap on a thing in the world: what its command names is discovered (D1). */
export function discoverTapped(state: GameState, layout: Layout, c: Command, events: EventBus): void {
  if (!layout.camp) return;
  for (const id of tappedThings(state, layout, c)) discover(state, id, events);
}

/** Each step: anything he holds now that he hasn't found yet (it came into his hands, or he made or built it). */
export function updateDiscovery(state: GameState, layout: Layout, events: EventBus): void {
  if (!layout.camp) return;
  const known = discoveredSet(state);
  heldThings(state, id => { if (!known.has(id)) discover(state, id, events); });
}
