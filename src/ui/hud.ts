// The always-on screen over the game, kept small so the scene stays in view on a phone (the UI foundation, 12 Oct
// 2026): the goal card, one line or two (the goal and how many of each thing he has, with a thin bar along its foot;
// tapping it opens his book, whose page has the how-to hint, or before he has the book shows the hint as a notice),
// with its Build or Make button while he can make the thing, so that stays one tap away; and once the camp is set up,
// saying so. The strip at the foot shows the skill gaining XP, its level and a thin bar (his health beside it:
// ui/combat.ts). Then the clock, hover text, notices and floating "+xp" numbers. What the panel used to show lives in
// windows now (ui/windows.ts): the backpack (ui/backpack.ts), the skills (ui/skills.ts), his book (ui/book.ts) and the
// settings (ui/settings.ts). Reads state and listens to events; never changes the game (the Build button sends a
// command).
import * as THREE from 'three';
import { allGoalsDone, currentGoal, made, maxHealth, type GameState } from '../core/state';
import { goalLines, type BookLine } from '../core/book';
import type { EventBus } from '../core/events';
import type { Command } from '../systems/commands';
import type { View } from '../render/view';
import type { SkillId } from '../data/skills';
import type { BuildingKind, Layout } from '../world/layout';
import type { Windows } from './windows';
import { levelFor, levelBounds } from '../data/xp';
import { ITEMS, SKILLS, TOOLS } from '../data/skills';
import { BOOK, CAMP_DONE, GOALS } from '../data/goals';
import { GATHERS } from '../data/pickups';
import { MAKES, makeDef } from '../data/making';
import { clockLabel } from '../core/clock';

const $ = (id: string) => document.getElementById(id)!;
/** Set an element's text only when it changed (the HUD and the windows are updated every frame). */
export const setText = (el: HTMLElement, text: string) => { if (el.textContent !== text) el.textContent = text; };
/** One of an item, with its article: "a berry", "a cooked fish". */
const oneOf = (id: string) => { const name = itemName(id, 1); return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`; };
/** What `n` of an item are called: "birch logs", "1 birch log" (ITEMS' `one`); his book is "book". */
export const itemName = (id: string, n: number) => id === BOOK ? 'book' : ((n === 1 && ITEMS[id]?.one) || ITEMS[id]?.name)?.toLowerCase() ?? id;
/** "28 birch logs"; several are joined by commas, the last by `last` ("20 birch logs and 8 copper ore") */
export const itemList = (items: Record<string, number>, last = ', ') => {
  const parts = Object.entries(items).filter(([, n]) => n > 0).map(([id, n]) => `${n.toLocaleString()} ${itemName(id, n)}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')}${last}${parts.at(-1)}` : parts[0] ?? '';
};
/** What a goal's line (core/book.ts) is called: the thing it needs, or (0.0.22) a skill level, "Attack level". */
export const lineName = (line: BookLine) => line.level ? `${SKILLS[line.id as SkillId]?.name ?? line.id} level` : itemName(line.id, line.need);
/** A goal's line as the card counts it: "2 / 4 rat hides", or a skill level, "Attack 2 / 3". */
const countOf = (line: BookLine) => line.level ? `${SKILLS[line.id as SkillId]?.name ?? line.id} ${line.got} / ${line.need}` : `${line.got} / ${line.need} ${itemName(line.id, line.need)}`;

/** What the goal card shows: the goal's title; under it how many of each thing he has (carried or stored, as his book
 *  counts them), or that he is on his way to make the thing or working on it; how far along (0 to 1, the bar) and
 *  whether everything is there; the Build or Make button while he can make the thing (what it makes and its words);
 *  and the goal's how-to hint (its ready text once everything is there), which his book's page shows and a tap on
 *  the card says before he has the book. Once every goal is done, the camp is set up (CAMP_DONE). */
export interface GoalCard { title: string; line: string; progress: number; ready: boolean; build: { id: string; label: string } | null; hint: string }

export function goalCard(state: GameState): GoalCard {
  if (allGoalsDone(state)) return { title: CAMP_DONE.title, line: CAMP_DONE.text, progress: 1, ready: true, build: null, hint: CAMP_DONE.text };
  const goal = currentGoal(state), parts = goalLines(state, goal);
  // (a level line counts the levels gained past 1, so the bar starts empty)
  const got = parts.reduce((a, p) => a + p.got - (p.level ? 1 : 0), 0), need = parts.reduce((a, p) => a + p.need - (p.level ? 1 : 0), 0), ready = got >= need;
  const def = goal.makes ? makeDef(goal.makes) : null, task = state.player.task, pending = state.player.pending;
  const building = !!def && task.kind === 'make' && task.id === def.id;
  const going = !!def && pending?.kind === 'make' && pending.id === def.id;
  const offer = !!def && ready && !building && !going && !made(state, def.id);
  const name = def?.name.toLowerCase() ?? '';
  return {
    title: goal.title,
    line: building ? `Working on the ${name}...` : going ? `On the way to ${def!.verb.toLowerCase()} the ${name}...` : parts.map(countOf).join(', '),
    progress: need ? got / need : 1, ready,
    build: offer ? { id: def!.id, label: `${def!.verb} the ${name}` } : null,
    hint: ready ? goal.ready : goal.hint,
  };
}

export class Hud {
  private floats: { el: HTMLElement; pos: THREE.Vector3; t: number }[] = [];
  // events can arrive many at a time (catching up after the tab was in the background), so they are
  // gathered here and shown once per frame, above wherever the miner is
  private pendingXp = 0;
  private pendingItems: Record<string, number> = {};
  private pendingLevel: { skill: SkillId; level: number } | null = null;
  private noticeTimer = 0;
  private hintGone = false;
  /** the skill that gained XP last, shown in the strip; none until one does */
  private active: SkillId | null = null;

  private buildFor: string | null = null;     // what the goal card's Build button makes, while it shows
  private goalHint = '';                      // the current goal's how-to hint, for a tap on the card before he has his book
  private hasBank: boolean;
  /** his health at most, as of the last frame, for the notice when he eats (chapter 2) */
  private maxHealth = 0;
  /** what the place things are stored is called in notices: the bank, or at the camp the chest */
  private store: string;

  constructor(private view: View, events: EventBus, private layout: Layout, queue: Command[], windows: Windows) {
    // the goal card only at the camp (it leads a new player on)
    this.hasBank = layout.buildings.some(b => b.kind === 'bank');
    this.store = this.hasBank ? 'bank' : 'chest';
    $('goal').hidden = !layout.camp;
    $('goalBuild').addEventListener('click', () => {
      const def = this.buildFor && makeDef(this.buildFor);
      if (def) queue.push({ type: 'make', id: def.id });
    });
    // tapping the card opens his book, whose page has the how-to hint (or closes it); before he has the book, the hint
    // shows as a notice
    $('goalOpen').addEventListener('click', () => {
      if (windows.isAvailable('book')) windows.toggle('book');
      else if (this.goalHint) this.notice(this.goalHint);
    });
    // a window opened: the how-to-play hint would peek out behind it, and the player is finding their way by now
    windows.on((_, open) => { if (open) this.hideHint(); });
    events.on(e => {
      if (e.type === 'xpGained') { this.pendingXp += e.amount; this.active = e.skill; }
      else if (e.type === 'visited') { const text = this.visitText(e.id); if (text) this.notice(text); }
      else if (e.type === 'backpackFull') this.notice(`Backpack full: off to the ${this.store}.`);
      else if (e.type === 'banked') this.notice(this.hasBank ? `Banked ${itemList(e.items, ' and ')}.` : `Stored ${itemList(e.items, ' and ')} in the chest.`);
      else if (e.type === 'stokeOff') this.notice('Nightfall: off to stoke the fire.');
      else if (e.type === 'fireLow') this.notice('No logs to stoke the fire tonight. It burns low.');
      else if (e.type === 'nothingToBank') this.notice('Your backpack is empty.');
      else if (e.type === 'noPath') this.notice("He can't find a way there.");
      else if (e.type === 'noStorage') this.notice("Your backpack is full, and there's nowhere to store it yet. Open the backpack to drop something.");
      else if (e.type === 'levelUp') this.pendingLevel = { skill: e.skill, level: e.level };
      else if (e.type === 'needTool') { const t = TOOLS[e.tool]; this.notice(`You need ${t.a} to ${t.use}.`); }
      else if (e.type === 'allGathered') this.notice(`That's all the ${GATHERS[e.gather].name.toLowerCase()}.`);
      else if (e.type === 'goalEnough') this.notice(`That's enough ${itemName(e.item, 2)} for "${GOALS.find(g => g.id === e.goal)?.title ?? e.goal}".`);
      else if (e.type === 'stacked') this.notice(e.logs > 0 ? `Stacked ${itemList({ birch_logs: e.logs })} on the firewood pile (${e.pile} there now).`
        : e.reason === 'full' ? 'The firewood pile is full.' : 'You have no logs to stack on the firewood pile.');
      else if (e.type === 'noRoom') this.notice('Your backpack is full. Open the backpack to drop something.');
      else if (e.type === 'dropped') this.notice(`Dropped ${itemList({ [e.item]: e.count })}.`);
      else if (e.type === 'cantDrop') this.notice(`You won't find more ${itemName(e.item, 2)}, so you keep them.`);
      else if (e.type === 'missing') {
        const def = MAKES[e.make];
        this.notice(`To ${def.verb.toLowerCase()} the ${def.name.toLowerCase()} you still need ${itemList(e.items, ' and ')}.`);
      }
      else if (e.type === 'goalFirst') this.notice(`Finish "${GOALS.find(g => g.id === e.goal)?.title ?? e.goal}" first.`);
      else if (e.type === 'made') this.notice(MAKES[e.make].done);
      // chapter 2: eating, and cooking at the campfire (each fish off the fire floats up over him)
      else if (e.type === 'ate') this.notice(`You eat ${oneOf(e.item)}. Health ${e.health} / ${this.maxHealth || e.health}.`);
      else if (e.type === 'cantEat') this.notice(e.reason === 'full' ? 'Your health is full. Keep it for later.'
        : e.reason === 'none' ? `You have no ${itemName(e.item, 2)} left.` : `You can't eat ${itemName(e.item, 2)}.`);
      else if (e.type === 'cantCook') this.notice('You have no raw fish to cook. Catch some first.');
      else if (e.type === 'cookedAll') this.notice("That's all your fish cooked.");
      else if (e.type === 'cooked') { const out = e.burnt ? 'burnt_fish' : 'cooked_fish'; this.pendingItems[out] = (this.pendingItems[out] ?? 0) + 1; }
      // picking up his book opens it instead of a notice (ui/book.ts)
      else if (e.type === 'pickedUp' && e.item) this.pendingItems[e.item] = (this.pendingItems[e.item] ?? 0) + e.count;
      // (chapter 2) a rat he beat left a hide in his backpack
      else if (e.type === 'beaten' && e.item) this.pendingItems[e.item] = (this.pendingItems[e.item] ?? 0) + 1;
      else if (e.type === 'levelTooLow') {
        const s = SKILLS[e.skill];
        this.notice(`You need ${s.name} level ${e.need} to ${s.verb.toLowerCase()} ${e.what.toLowerCase()}s.`);
      }
    });
  }

  hover(label: string | null): void {
    const el = $('hover');
    if (!label) { el.textContent = 'Walk here'; return; }
    const [verb, thing] = label.split('|');
    el.innerHTML = ''; el.append(`${verb} `);
    const b = document.createElement('b'); b.textContent = thing ?? ''; el.append(b);
  }

  /** The how-to-play hint goes for good. */
  private hideHint(): void { this.hintGone = true; $('hint').classList.add('gone'); }

  /** The goal card (goalCard): its title and line, the bar, and the Build or Make button while he can make the thing. */
  private updateGoal(state: GameState): void {
    const card = goalCard(state), button = $('goalBuild') as HTMLButtonElement;
    setText($('goalTitle'), card.title);
    setText($('goalCount'), card.line);
    $('goalCount').hidden = !!card.build;           // the button says it all
    $('goalBar').style.width = `${card.progress * 100}%`;
    $('goal').classList.toggle('ready', card.ready);
    this.buildFor = card.build?.id ?? null;
    this.goalHint = card.hint;
    button.hidden = !card.build;
    if (card.build) setText(button, card.build.label);
  }

  /** The strip's skill: the one that gained XP last, its level and a thin bar in its colour, once one has. */
  private updateStrip(state: GameState): void {
    const id = this.active;
    $('xpRow').hidden = !id;
    if (!id) return;
    const xp = state.skills[id], lvl = levelFor(xp), [lo, hi] = levelBounds(lvl), bar = $('xpBar');
    setText($('xpName'), SKILLS[id].name);
    setText($('xpLvl'), String(lvl));
    bar.style.width = `${lvl >= 99 ? 100 : (xp - lo) / (hi - lo) * 100}%`;
    bar.style.background = SKILLS[id].color;
  }

  /** What a building or a piece of land says when the miner arrives, while it has no use yet. The bank has one: its
   *  notice says what was banked; so does the camp's chest, and the campfire he stokes says nothing. */
  private visitText(id: string): string | null {
    const b = this.layout.buildings.find(x => x.id === id);
    if (!b) return this.layout.parcels.some(x => x.id === id) ? 'Unexplored land. You will be able to claim it at the city hall in a later update.' : null;
    const text: Record<BuildingKind, string | null> = {
      bank: null,
      cityhall: 'The city hall will handle land claims in a later update.',
      forge: 'The forge is cold for now. Smithing comes in a later update.',
      stall: "The merchant hasn't arrived yet.",
      inn: 'The inn opens its doors in a later update.',
      barn: 'The barn will hold carts and tools in a later update.',
      house: 'Nobody lives here yet. Villagers move in later.',
    };
    return text[b.kind];
  }

  /** Show a notice under the goal card for a few seconds (also used by ui/combat.ts and ui/rats.ts). */
  notice(text: string): void {
    // notices take the hint's place, and by then the player knows how to play, so the hint goes for good
    this.hideHint();
    const el = $('notice'); el.textContent = text; el.classList.add('show'); this.noticeTimer = 3;
  }

  /** A word drifting up from a spot in the world, like the floating XP (the "z" over the tent while he sleeps). */
  drift(text: string, at: { x: number; z: number }): void { this.float(text, false, at); }

  private float(text: string, big: boolean, at: { x: number; z: number }): void {
    if (this.floats.length > 8) this.floats.shift()!.el.remove();
    const el = document.createElement('div'); el.className = 'float' + (big ? ' big' : ''); el.textContent = text;
    $('floats').appendChild(el);
    this.floats.push({ el, pos: new THREE.Vector3(at.x, big ? 2.5 : 2.15, at.z), t: 0 });
  }

  update(state: GameState, dt: number): void {
    // the how-to-play hint fades once the player has sent the miner somewhere (or a save already has him busy)
    if (!this.hintGone && state.player.task.kind !== 'idle') this.hideHint();
    if (this.pendingXp) { this.float(`+${Math.round(this.pendingXp).toLocaleString()} xp`, false, state.player.pos); this.pendingXp = 0; }
    for (const [item, n] of Object.entries(this.pendingItems)) this.float(`+${n} ${itemName(item, n)}`, false, state.player.pos);
    this.pendingItems = {};
    if (this.pendingLevel) {
      this.float(`${SKILLS[this.pendingLevel.skill].name} level ${this.pendingLevel.level}!`, true, state.player.pos);
      this.pendingLevel = null;
    }
    if (this.noticeTimer > 0) { this.noticeTimer -= dt; if (this.noticeTimer <= 0) $('notice').classList.remove('show'); }
    this.maxHealth = maxHealth(state);
    this.updateStrip(state);
    setText($('clock'), clockLabel(state.time));
    if (this.layout.camp) this.updateGoal(state);
    const b = this.view.renderer.domElement.getBoundingClientRect();
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]!; f.t += dt;
      const v = f.pos.clone().project(this.view.cam.camera);
      f.el.style.left = `${(v.x + 1) / 2 * b.width}px`;
      f.el.style.top = `${(1 - v.y) / 2 * b.height - f.t * 30}px`;
      f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.3));
      if (f.t > 1.3) { f.el.remove(); this.floats.splice(i, 1); }
    }
  }
}
