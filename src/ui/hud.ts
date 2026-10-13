// The always-on screen over the game, kept small so the scene stays in view on a phone (the UI foundation, 12 Oct
// 2026): the goal line in the bar at the foot (since 0.0.38 one slim line, the owner: "now the task takes up a lot
// space"): the goal's name and how many of each thing he has (a shorter count where the whole one doesn't fit), a thin
// bar along its foot, its Build or Make button while he can make the thing, so that stays one tap away, and the arrow
// that sends him off on the goal's next step (systems/nextstep.ts); a tap on its name opens the goal's page in
// Information (ui/info.ts, D6); once the camp is set up, saying so. His state beside it shows the skill gaining XP, its
// level and a thin bar (his health beside it: ui/combat.ts; each as an icon and a number where room is short, ui/rail.ts).
// Then the clock, hover text, notices and floating "+xp" numbers. What the panel used to show lives in windows now
// (ui/windows.ts): the backpack (ui/backpack.ts), the skills (ui/skills.ts), Discovery (ui/discovery.ts), Information (ui/info.ts) and the
// settings (ui/settings.ts). Reads state and listens to events; never changes the game (the Build button and the arrow
// send commands).
import * as THREE from 'three';
import { allGoalsDone, currentGoal, made, maxHealth, type GameState } from '../core/state';
import { goalLines, type BookLine } from '../core/book';
import { begunIds, progressOf, stagedDef } from '../core/building';
import type { EventBus, GameEvent } from '../core/events';
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
import { goalThought } from '../data/thoughts';
import { SKILL_ICONS, STATE_ICONS } from './pictures';

/** Seconds after a goal starts before its tip shows, so the notices of finishing the last one are read first. */
const GOAL_TIP_AFTER = 3;

const $ = (id: string) => document.getElementById(id)!;
/** Set an element's text only when it changed (the HUD and the windows are updated every frame). */
export const setText = (el: HTMLElement, text: string) => { if (el.textContent !== text) el.textContent = text; };
/** Set an attribute only when it changed. */
export const setAttr = (el: Element, name: string, value: string) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
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
/** A goal's line as the goal line counts it: "2 / 4 rat hides", or a skill level, "Attack 2 / 3". */
const countOf = (line: BookLine) => line.level ? `${SKILLS[line.id as SkillId]?.name ?? line.id} ${line.got} / ${line.need}` : `${line.got} / ${line.need} ${itemName(line.id, line.need)}`;

/** What is said when logs are stacked, or can't be: on the firewood pile, or (once it stands) in the woodshed. */
export function stackedText(e: Extract<GameEvent, { type: 'stacked' }>): string {
  const shed = e.at === 'woodshed', where = shed ? 'in the woodshed' : 'on the firewood pile';
  if (e.logs > 0) return `Stacked ${itemList({ birch_logs: e.logs })} ${where} (${e.pile} there now).`;
  return e.reason === 'full' ? `The ${shed ? 'woodshed' : 'firewood pile'} is full.` : `You have no logs to stack ${where}.`;
}

/** What the goal line shows: the goal's title; beside or under it how many of each thing he has (carried or stored, as
 *  his book counts them), or that he is on his way to make the thing or working on it (something built in stages: how far
 *  along, "Building the campfire... 40%"); how far along the goal is (0 to 1, the bar) and whether everything is there (a
 *  goal whose thing is begun is paid for: all there); the Build or Make button while he can make the thing (what it
 *  makes, its words, and the command it sends: `build` for something built at the camp's spots, `make` for something
 *  made where he stands), which says "Carry on with the campfire" once that is begun and he isn't at it (and with
 *  something else under way, built one at a time, "Carry on with" that first, how far along it is while he builds it);
 *  and the goal's how-to hint (its ready text once everything is there), which the goal's page shows. Once every goal is
 *  done, the camp is set up (CAMP_DONE). Since the survival book, `thought`: what he thinks about the goal, in his own
 *  words (data/thoughts.ts; the hint for a goal without one). Since the slim goal line (0.0.38), `short`: the count where
 *  the whole `line` doesn't fit, the first thing still short ("2 / 7 planks"; "Building... 40%"), and `tiny` where even
 *  that doesn't, its numbers alone ("2 / 7"; "40%"; nothing for being on his way or at work, which the tag over his head
 *  says); and the button's `short` words, the verb alone ("Build", "Carry on", "Carry on: wall tent" for another thing),
 *  its `label` in its tooltip. */
export interface GoalCard {
  title: string; line: string; short: string; tiny: string; progress: number; ready: boolean;
  build: { id: string; label: string; short: string; send: 'build' | 'make' } | null;
  hint: string; thought: string;
}

/** "Building", "Stacking": what doing `verb` is called. */
const doing = (verb: string) => verb.toLowerCase() === 'make' ? 'Making' : `${verb}ing`;

export function goalCard(state: GameState): GoalCard {
  if (allGoalsDone(state)) return { title: CAMP_DONE.title, line: CAMP_DONE.text, short: '', tiny: '', progress: 1, ready: true, build: null, hint: CAMP_DONE.text, thought: '' };
  const goal = currentGoal(state), parts = goalLines(state, goal);
  // (a level line counts the levels gained past 1, so the bar starts empty)
  const got = parts.reduce((a, p) => a + p.got - (p.level ? 1 : 0), 0), need = parts.reduce((a, p) => a + p.need - (p.level ? 1 : 0), 0), ready = got >= need;
  const def = goal.makes ? makeDef(goal.makes) : null, task = state.player.task, pending = state.player.pending;
  // (the camp build) something built at the camp's spots goes up in stages: begun, it is carried on with
  const staged = !!def && !!stagedDef(def.id), begun = !!def && state.underway[def.id] !== undefined;
  // one thing built at a time (D8): with something else under way, that comes first
  const other = staged && !begun ? begunIds(state)[0] ?? null : null, thing = def && other ? MAKES[other] : def;
  const at = (kind: 'task' | 'pending') => { const t = kind === 'task' ? task : pending; return !!thing && !!t && (t.kind === 'make' || t.kind === 'raise') && t.id === thing.id; };
  const building = at('task'), going = at('pending');
  const offer = !!thing && (ready || begun) && !building && !going && !made(state, thing.id);
  const name = thing?.name.toLowerCase() ?? '';
  const percent = thing && stagedDef(thing.id) ? ` ${Math.floor(progressOf(state, thing.id) * 100)}%` : '';
  const working = percent ? `${doing(thing!.verb)} the ${name}...${percent}` : `Working on the ${name}...`;
  // the first thing still short (the last line once all are there), for the short count
  const next = parts.find(p => !p.done) ?? parts.at(-1);
  return {
    title: goal.title,
    line: building ? working : going ? `On the way to ${thing!.verb.toLowerCase()} the ${name}...` : parts.map(countOf).join(', '),
    short: building ? (percent ? `${doing(thing!.verb)}...${percent}` : 'Working...') : going ? 'On the way...' : next ? countOf(next) : '',
    tiny: building ? percent.trim() : going ? '' : next ? `${next.got} / ${next.need}` : '',
    progress: need ? got / need : 1, ready,
    build: offer ? {
      id: thing!.id, label: begun || other ? `Carry on with the ${name}` : `${thing!.verb} the ${name}`,
      short: other ? `Carry on: ${name}` : begun ? 'Carry on' : thing!.verb, send: stagedDef(thing!.id) ? 'build' : 'make',
    } : null,
    hint: ready ? goal.ready : goal.hint,
    thought: goalThought(goal.id)?.text ?? goal.hint,
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

  /** what the goal line's Build button builds or makes, while it shows */
  private buildFor: { id: string; send: 'build' | 'make' } | null = null;
  /** what the goal line's count was last fitted to (its words, the line's width, the text size), so it is measured only
   *  on a change */
  private fitted = '';
  private hasBank: boolean;
  /** his health at most, as of the last frame, for the notice when he eats (chapter 2) */
  private maxHealth = 0;
  /** what the place things are stored is called in notices: the bank, or at the camp the chest */
  private store: string;

  /** A tap on the goal line's name: opens the goal's page (main.ts sets it: Information's Story, ui/info.ts). */
  goalName: () => void = () => {};

  constructor(private view: View, events: EventBus, private layout: Layout, queue: Command[], windows: Windows) {
    // the goal line only at the camp (it leads a new player on)
    this.hasBank = layout.buildings.some(b => b.kind === 'bank');
    this.store = this.hasBank ? 'bank' : 'chest';
    $('goal').hidden = !layout.camp;
    $('goalBuild').addEventListener('click', () => {
      const to = this.buildFor, def = to && makeDef(to.id);
      if (to && def) queue.push(to.send === 'build' ? { type: 'build', id: def.id } : { type: 'make', id: def.id });
    });
    // the arrow sends him off on the goal's next step (systems/nextstep.ts), as a tap on the card did (D6); its name
    // opens the goal's page
    $('goalGo').addEventListener('click', () => queue.push({ type: 'next' }));
    $('goalOpen').addEventListener('click', () => this.goalName());
    // his state's icons, for where it shows compactly (index.html's .dock.compact)
    for (const el of document.querySelectorAll<SVGElement>('.st-icon[data-icon]')) el.innerHTML = STATE_ICONS[el.dataset.icon!] ?? '';
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
      // (the survival book) a tap on the goal card or his thought, when he is at it already or there's nothing to do yet
      else if (e.type === 'onIt') this.notice("He's already at it.");
      else if (e.type === 'nothingYet') this.notice(e.item ? `No ${itemName(e.item, 2)} lying about just now. More turn up in a while.` : 'Nothing to do for that just now.');
      else if (e.type === 'noStorage') this.notice("Your backpack is full, and there's nowhere to store it yet. Open the backpack to drop something.");
      else if (e.type === 'levelUp') this.pendingLevel = { skill: e.skill, level: e.level };
      else if (e.type === 'needTool') { const t = TOOLS[e.tool]; this.notice(`You need ${t.a} to ${t.use}.`); }
      else if (e.type === 'allGathered') this.notice(`That's all the ${GATHERS[e.gather].name.toLowerCase()}.`);
      else if (e.type === 'goalEnough') this.notice(`That's enough ${itemName(e.item, 2)} for "${GOALS.find(g => g.id === e.goal)?.title ?? e.goal}".`);
      else if (e.type === 'stacked') this.notice(stackedText(e));
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
      // picking up his book opens Information at the story instead of a notice (main.ts)
      else if (e.type === 'pickedUp' && e.item) this.pendingItems[e.item] = (this.pendingItems[e.item] ?? 0) + e.count;
      // (chapter 2) a rat he beat left a hide in his backpack
      else if (e.type === 'beaten' && e.item) this.pendingItems[e.item] = (this.pendingItems[e.item] ?? 0) + 1;
      else if (e.type === 'levelTooLow') {
        const s = SKILLS[e.skill];
        this.notice(`You need ${s.name} level ${e.need} to ${s.verb.toLowerCase()} ${e.what.toLowerCase()}s.`);
      }
    });
  }

  /** The words under the mouse: "Chop|Birch tree" shows as "Chop **Birch tree**"; a thing alone ("Tent": nothing to do
   *  there now but walk over) just its name. */
  hover(label: string | null): void {
    const el = $('hover');
    if (!label) { el.textContent = 'Walk here'; return; }
    const [verb, thing] = label.includes('|') ? label.split('|') : ['', label];
    el.innerHTML = ''; if (verb) el.append(`${verb} `);
    const b = document.createElement('b'); b.textContent = thing ?? ''; el.append(b);
  }

  /** The how-to-play hint goes for good. */
  private hideHint(): void { this.hintGone = true; $('hint').classList.add('gone'); }

  /** The goal line (goalCard): its title and count, the bar, the Build or Make button while he can make the thing, and
   *  the arrow (none once every goal is done: there is nowhere to send him). */
  private updateGoal(state: GameState): void {
    const card = goalCard(state), button = $('goalBuild') as HTMLButtonElement;
    setText($('goalTitle'), card.title);
    $('goalCount').hidden = !!card.build;           // the button says it all
    if (!card.build) this.fitCount([card.line, card.short, card.tiny]);
    $('goalBar').style.width = `${card.progress * 100}%`;
    $('goal').classList.toggle('ready', card.ready);
    this.buildFor = card.build ? { id: card.build.id, send: card.build.send } : null;
    // the words for a screen reader and the tooltip: the whole count, wherever a shorter one shows
    setAttr($('goalOpen'), 'aria-label', `${card.title}: ${card.line.replace(/[.]*$/, '')}. Read its page.`);
    setAttr($('goalOpen'), 'title', `${card.title}: ${card.line}`);
    setAttr($('goalGo'), 'aria-label', `Set off: ${card.title}`);
    setAttr($('goalGo'), 'title', 'Set off');
    $('goalGo').hidden = allGoalsDone(state);
    button.hidden = !card.build;
    if (card.build) { setText(button, card.build.short); setAttr(button, 'title', card.build.label); setAttr(button, 'aria-label', card.build.label); }
  }

  /** The count beside or under the goal's name: the whole of it while it fits, else the short one, else the numbers
   *  alone (goalCard's `line`, `short`, `tiny`), measured again when the words, the line's width or the text size change. */
  private fitCount(counts: string[]): void {
    const el = $('goalCount'), key = `${counts.join('|')}|${$('goal').clientWidth}|${document.documentElement.dataset.textSize ?? ''}`;
    if (key === this.fitted) return;
    this.fitted = key;
    for (const text of counts) { el.textContent = text; if (el.scrollWidth <= el.clientWidth + 1) break; }
  }

  /** The strip's skill: the one that gained XP last, its level and a thin bar in its colour, once one has (its icon in
   *  its colour where his state shows compactly; its name and level in its tooltip). */
  private updateStrip(state: GameState): void {
    const id = this.active;
    $('xpRow').hidden = !id;
    if (!id) return;
    const xp = state.skills[id], lvl = levelFor(xp), [lo, hi] = levelBounds(lvl), bar = $('xpBar'), icon = $('xpIcon');
    if (icon.dataset.skill !== id) { icon.dataset.skill = id; icon.innerHTML = SKILL_ICONS[id] ?? ''; icon.style.color = SKILLS[id].color; }
    setText($('xpName'), SKILLS[id].name);
    setText($('xpLvl'), String(lvl));
    setAttr($('xpRow'), 'title', `${SKILLS[id].name} level ${lvl}`);
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

  /** Show a notice at the top for a few seconds (also used by ui/combat.ts and ui/rats.ts). */
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

  /** The goal shown last (null before the first frame), and a new goal's tip waiting to show (after the notices of
   *  finishing the last one have been read). */
  private goalSeen: string | null = null;
  private tip: { text: string; in: number } | null = null;

  /** A new goal's tip shows once, as a notice, a moment after it starts (13 Oct 2026, from the chapter review the owner
   *  agreed to: "show each new goal's tip once when it starts"); not for the goal a game opens on. */
  private goalTip(state: GameState, dt: number): void {
    const goal = currentGoal(state);
    if (this.goalSeen !== null && goal.id !== this.goalSeen && !allGoalsDone(state) && goal.hint) this.tip = { text: goal.hint, in: GOAL_TIP_AFTER };
    this.goalSeen = goal.id;
    if (this.tip && (this.tip.in -= dt) <= 0) { this.notice(this.tip.text); this.tip = null; }
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
    if (this.layout.camp) { this.updateGoal(state); this.goalTip(state, dt); }
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
