// Fighting (chapter 2, holding the camp, 0.0.22), as in OSRS; the numbers are in data/combat.ts. Tapping something to
// fight (core/targets.ts: the training dummy) sends him to stand within his weapon's reach of it, and he strikes it
// over and over, a strike every `speed` seconds of his weapon, until he is sent elsewhere. Each strike is an accuracy
// roll (his Attack level and his gear's attack bonus against the target's defence) and, if it lands, damage from 0 to
// his max hit (his Strength level and his gear's strength bonus). Damage gives XP to the style he trains
// (GameState.combatStyle: Attack, Strength or Defence, each +3 to its own skill in the rolls) and a third as much to
// Vitality. Without a weapon he doesn't set off. Since 0.0.25 he switches what he trains by himself (the owner's pick,
// 12 Oct 2026, so practice stays idle): when the style he trains reaches the level the camp's goal asks of it, to the
// next the goal asks for; when the target has taught him all it can of it (the dummy's level limit), to the lowest it
// can still teach; with nothing left to learn there he stops and says so. His health comes back slowly while he is hurt, and a Vitality level adds to it.
// The rats (chapter 2, part 2) are fought the same way: a strike takes a rat's health, and systems/rats.ts does the
// rest (it bites back, topples over at 0, comes back; he waits while the rat he beat is down, then goes on).
import { allGoalsDone, currentGoal, goalMet, maxHealth, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { Layout } from '../world/layout';
import { foeOf, targetOf, type Target } from '../core/targets';
import { goNear } from '../actors/player';
import { COMBAT, GEAR, HEALTH, SLOTS, STRIKE, STYLES, strikeEvery, type CombatStyle, type GearDef, type GearId } from '../data/combat';
import { addXp, levelOf } from './skills';

/** A level as the rolls use it (OSRS's effective level): the level, +3 when the style he fights in trains this skill,
 *  and +8. */
export const effectiveLevel = (level: number, trained: boolean) => level + (trained ? COMBAT.styleBonus : 0) + 8;

/** An attack or defence roll (OSRS): an effective level times (the bonus + 64). */
export const roll = (effective: number, bonus: number) => effective * (bonus + 64);

/** A target's defence roll, as a creature's in OSRS: (its defence level + 9) times (its defence bonus + 64). */
export const defenceRoll = (t: Pick<Target, 'defence' | 'defenceBonus'>) => roll(t.defence + 9, t.defenceBonus);

/** The chance an attack roll lands against a defence roll (OSRS). */
export const hitChance = (attack: number, defence: number) =>
  attack > defence ? 1 - (defence + 2) / (2 * (attack + 1)) : attack / (2 * (defence + 1));

/** The most damage one strike can do (OSRS): from the effective Strength level and the strength bonus. */
export const maxHit = (effectiveStrength: number, bonus: number) => Math.floor(0.5 + effectiveStrength * (bonus + 64) / 640);

/** What he wears, slot by slot. */
export const worn = (state: GameState): GearDef[] => SLOTS.flatMap(s => { const id = state.equipment[s]; return id ? [GEAR[id]] : []; });

/** His bonus of one kind from everything he wears. */
export const gearBonus = (state: GameState, kind: 'attack' | 'strength' | 'defence') => worn(state).reduce((a, g) => a + g[kind], 0);

/** His weapon, or null. */
export const weaponOf = (state: GameState): GearDef | null => { const id = state.equipment.weapon; return id ? GEAR[id] : null; };

/** Put on gear he made (systems/making): it goes in its slot, in place of anything there. */
export function wear(state: GameState, id: GearId): void { state.equipment[GEAR[id].slot] = id; }

/** His attack roll, with his Attack level, the style he trains and his gear. */
export const attackRoll = (state: GameState) =>
  roll(effectiveLevel(levelOf(state, 'attack'), state.combatStyle === 'attack'), gearBonus(state, 'attack'));

/** His max hit, with his Strength level, the style he trains and his gear. */
export const maxHitOf = (state: GameState) =>
  maxHit(effectiveLevel(levelOf(state, 'strength'), state.combatStyle === 'strength'), gearBonus(state, 'strength'));

/** His defence roll, with his Defence level, the style he trains and his gear (his armour): what anything that hits
 *  back rolls against (hitChance(its attack roll, this)), so the armour he wears makes him harder to hit. */
export const defenceRollOf = (state: GameState) =>
  roll(effectiveLevel(levelOf(state, 'defence'), state.combatStyle === 'defence'), gearBonus(state, 'defence'));

/** One strike at `target`: whether it lands (an accuracy roll) and how hard (0 to his max hit, so a strike that lands
 *  can still do 0, as in OSRS). 0 for a miss. */
export function rollStrike(state: GameState, target: Target, rng: Rng): number {
  if (rng.next() >= hitChance(attackRoll(state), defenceRoll(target))) return 0;
  return Math.floor(rng.next() * (maxHitOf(state) + 1));
}

/** How far from a target's middle he stands to strike it: the swing's reach, further back from bigger targets. */
export const strikeReach = (t: Pick<Target, 'radius'>) => STRIKE.reach + (t.radius - STRIKE.refRadius);

/** Why he can't fight `target` now: no weapon, or it has taught him all it can of the style he trains; else null. */
function cantFight(state: GameState, target: Target): 'weapon' | 'taught' | null {
  if (!weaponOf(state)) return 'weapon';
  return levelOf(state, state.combatStyle) >= target.maxLevel ? 'taught' : null;
}

/** The style to train next: one the camp's current goal still asks a level of, first in STYLES order, that `target`
 *  can teach; none while the goal still asks for more than `target` teaches (he stops there and is sent to something
 *  that can, the rats); else, when `target` has taught him all it can of the style he trains, the lowest it can still
 *  teach; else null (he keeps the style he has). */
export function nextStyle(state: GameState, layout: Layout, target: Target | null): CombatStyle | null {
  const teaches = (s: CombatStyle) => !target || levelOf(state, s) < target.maxLevel;
  const levels = layout.camp && !allGoalsDone(state) ? currentGoal(state).levels : undefined;
  const wants = (s: CombatStyle) => levels?.[s] !== undefined && levelOf(state, s) < levels[s]!;
  if (levels) {
    const asked = STYLES.find(s => s !== state.combatStyle && wants(s) && teaches(s));
    if (asked) return asked;
    if (STYLES.some(wants)) return null;
  }
  if (!target || teaches(state.combatStyle)) return null;
  return STYLES.filter(teaches).sort((a, b) => levelOf(state, a) - levelOf(state, b))[0] ?? null;
}

/** Nothing left for `target` to teach in the style he trains: he moves on to one it can (nextStyle), saying so. */
function switchIfTaught(state: GameState, layout: Layout, target: Target, events: EventBus): void {
  if (cantFight(state, target) !== 'taught') return;
  const next = nextStyle(state, layout, target), from = state.combatStyle;
  if (!next) return;
  state.combatStyle = next;
  events.emit({ type: 'switchedStyle', target: target.id, from, to: next });
}

/** For the fight command (systems/commands): whether to set off to fight `id`. Not when there is nothing by that id to
 *  fight here (the dummy not built yet) or he is at it already, or on his way; refused, saying why (`cantFight`), with
 *  no weapon, or when it has nothing more to teach of the style he trains. */
export function mayFight(state: GameState, layout: Layout, id: string, events: EventBus): boolean {
  const target = targetOf(state, layout, id), p = state.player;
  if (!target) return false;
  if ((p.task.kind === 'fight' && p.task.target === id) || (p.pending?.kind === 'fight' && p.pending.id === id)) return false;
  switchIfTaught(state, layout, target, events);
  const why = cantFight(state, target);
  if (why) { events.emit({ type: 'cantFight', target: id, reason: why, skill: state.combatStyle }); return false; }
  return true;
}

/** Walk to stand within striking reach of `id`, on the side nearest him (beside it, for the goblin chief: Target.beside);
 *  there he starts fighting it (actors/player). */
export function goFight(state: GameState, layout: Layout, id: string): boolean {
  const target = targetOf(state, layout, id);
  return !!target && goNear(state, layout, target.pos, strikeReach(target), { kind: 'fight', id }, target.beside);
}

/** Choose what fighting trains (the panel's Train choice; a style command). It doesn't stop what he is doing. */
export function setStyle(state: GameState, style: unknown): void {
  if (STYLES.includes(style as CombatStyle)) state.combatStyle = style as CombatStyle;
}

/** While hurt, 1 health back every HEALTH.regen seconds of play, never past his most. Counted on the game clock, so
 *  nothing more is saved and catching up gives what playing would. */
function regenerate(state: GameState, dt: number): void {
  const max = maxHealth(state);
  if (state.health >= max) return;
  if (Math.floor(state.time / HEALTH.regen) > Math.floor((state.time - dt) / HEALTH.regen)) state.health = Math.min(max, state.health + 1);
}

/** He strikes: the hit (or miss) is announced, and damage gives XP, the style he trains last so its row lights up. A
 *  creature (chapter 2: a rat, a goblin) loses that much health, never more than it has (systems/rats.ts and
 *  systems/goblins.ts see to it once it is beaten). */
function strike(state: GameState, layout: Layout, target: Target, rng: Rng, events: EventBus): void {
  const rolled = rollStrike(state, target, rng), style = state.combatStyle;
  const damage = target.foe ? Math.min(rolled, target.foe.health) : rolled;
  if (target.foe && damage > 0) foeOf(state, target.id)!.health -= damage;
  events.emit({ type: 'hit', target: target.id, damage });
  if (damage <= 0) return;
  const xp = damage * target.xp, most = maxHealth(state), level = levelOf(state, style);
  addXp(state, 'vitality', xp * COMBAT.vitality, events);
  state.health += maxHealth(state) - most;                  // a Vitality level adds to his health as well as his most
  addXp(state, style, xp, events);
  // the camp's goal asks this much of the skill he trains and more of another: he says so, and trains the next it asks for
  const now = levelOf(state, style);
  if (now === level || !layout.camp || allGoalsDone(state)) return;
  const goal = currentGoal(state), need = goal.levels?.[style];
  if (need === undefined || level >= need || now < need || goalMet(state, goal)) return;
  const next = nextStyle(state, layout, target);
  if (next) state.combatStyle = next;
  events.emit(next ? { type: 'goalLevel', skill: style, level: now, goal: goal.id, next } : { type: 'goalLevel', skill: style, level: now, goal: goal.id });
}

/** Whether progress going from `before` to `after` (round 0..1, wrapping) passed `at`. */
const passed = (before: number, after: number, at: number) => before < at ? after >= at || after < before : after < before && after >= at;

/** Health coming back, and the fight he is in: a strike each time his weapon comes round again (systems/combat's
 *  strike), until he is sent elsewhere; he stops when the target has nothing more to teach him in the style he trains. */
export function updateCombat(state: GameState, layout: Layout, dt: number, rng: Rng, events: EventBus): void {
  regenerate(state, dt);
  const p = state.player, task = p.task;
  if (task.kind !== 'fight') return;
  const target = targetOf(state, layout, task.target);
  if (!target) { p.task = { kind: 'idle' }; return; }        // nothing there to fight any more
  if (target.foe?.down) { task.progress = 0; return; }        // a rat he beat: he waits (systems/rats.ts moves him on)
  switchIfTaught(state, layout, target, events);
  const why = cantFight(state, target);
  if (why) { p.task = { kind: 'idle' }; events.emit({ type: 'cantFight', target: target.id, reason: why, skill: state.combatStyle }); return; }
  const every = strikeEvery(state.equipment.weapon), before = task.progress;
  task.progress = (task.progress + dt / every) % 1;
  if (passed(before, task.progress, STRIKE.impact / every)) strike(state, layout, target, rng, events);
}
