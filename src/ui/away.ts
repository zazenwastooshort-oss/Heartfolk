// "While you were away" (game 0.0.20): when he caught up at least a minute of play since you last looked (the game was
// closed, or open in a background tab) and did something in it, a small note says how long you were away, how much of
// it he worked, and what he did: what he gathered, the XP and any levels, the fire. "Got it" closes it. It waits while
// "What's new", the welcome or his book is open, and steps aside if one opens over it. systems/away.ts counts; this
// only words it and shows it. Changes nothing in the game.
import type { Away, AwaySummary } from '../systems/away';
import { SKILLS, type SkillId } from '../data/skills';
import { MAKES, makeDef } from '../data/making';
import { itemList } from './hud';

const $ = (id: string) => document.getElementById(id)!;

/** Real time in words, to the minute below: "45 min", "3 h", "2 h 30 min", "3 days". */
export function duration(seconds: number): string {
  const min = Math.max(0, Math.floor(seconds / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  const days = Math.floor(h / 24);
  return days > 365 ? 'more than a year' : `${days} days`;
}

/** How much of a stretch away he worked: "worked all that time at a fifth of his speed", "worked for 2 h at full speed". */
const worked = (a: Away) => `worked ${a.counted < a.real ? `for ${duration(a.counted)}` : 'all that time'} ${a.open ? 'at full speed' : 'at a fifth of his speed'}`;

/** The note's words: a lead saying how long you were away and how much of it he worked (`spans`: one stretch, or more
 *  when a later catch-up came while the note was still up), then a line each for what he gathered, each skill's XP (and
 *  the level it reached), the fire, what he finished making, and a backpack that filled with nowhere to store it or
 *  (0.0.22) practice that stopped at the training dummy's level limit. */
export function awayText(spans: Away[], s: AwaySummary): { lead: string; lines: string[] } {
  const lead = spans.map((a, i) => i > 0 ? `Then ${duration(a.real)} more${a.open ? ' with the game open' : ''}, and he ${worked(a)}.`
    : `Away ${duration(a.real)}. ${a.open ? `The game was still open, so he ${worked(a)}.` : `He ${worked(a)}.`}`).join(' ');
  const lines: string[] = [];
  const got = itemList(s.items, ' and ');
  if (got) lines.push(`He gathered ${got}.`);
  for (const id of Object.keys(SKILLS) as SkillId[]) {
    const xp = s.xp[id], level = s.levels[id];
    if (xp) lines.push(`${SKILLS[id].name}: +${Math.round(xp).toLocaleString()} XP${level ? `, up to level ${level}` : ''}.`);
  }
  if (s.stoked) lines.push(s.stoked === 1 ? 'He stoked the fire at nightfall.' : `He stoked the fire on ${s.stoked} nights.`);
  if (s.fireLow) lines.push(s.fireLow === 1 ? 'One night there were no logs, so the fire burned low.' : `On ${s.fireLow} nights there were no logs, so the fire burned low.`);
  for (const id of s.made) lines.push(`He finished the ${MAKES[id].name.toLowerCase()}.`);
  if (s.full) lines.push('Then his backpack was full, with nowhere to store it.');
  // (0.0.22) he stopped at the training dummy's level limit
  if (s.taught) lines.push(`Then the ${makeDef(s.taught.target)?.name.toLowerCase() ?? 'training dummy'} couldn't teach him any more ${SKILLS[s.taught.skill].name}, so he stopped.`);
  return { lead, lines };
}

export class AwayNote {
  private panel = $('away');
  private ok = $('awayOk') as HTMLButtonElement;
  private waiting = false;

  constructor() {
    this.ok.addEventListener('click', () => { this.panel.hidden = true; });
    this.panel.addEventListener('keydown', e => { if (e.key === 'Escape') this.panel.hidden = true; });
  }

  /** Whether the note is up, or waiting to be: a later catch-up then adds to it (main.ts) rather than replace it. */
  get unseen(): boolean { return this.waiting || !this.panel.hidden; }

  /** Word the note and show it, once nothing else is in the way (update). */
  show(spans: Away[], summary: AwaySummary): void {
    const { lead, lines } = awayText(spans, summary);
    $('awayLead').textContent = lead;
    $('awayList').replaceChildren(...lines.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    this.waiting = true;
    this.update();
  }

  /** Each frame: while "What's new", the welcome or his book is open, the note waits, stepping aside if one opened
   *  over it (from the version button or the goal card); once none is, it shows. */
  update(): void {
    const inTheWay = !$('news').hidden || !$('intro').hidden || !$('book').hidden;
    if (inTheWay && !this.panel.hidden) { this.panel.hidden = true; this.waiting = true; }
    if (!this.waiting || inTheWay) return;
    this.waiting = false;
    $('hint').classList.add('gone');                // a returning player knows how to play
    this.panel.hidden = false;
    this.ok.focus({ preventScroll: true });
  }
}
