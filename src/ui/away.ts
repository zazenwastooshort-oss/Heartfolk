// "While you were away" (game 0.0.20): when he caught up at least a minute of play since you last looked (the game was
// closed, or open in a background tab) and did something in it, a small note says how long you were away, how much of
// it he worked, and what he did: what he gathered, the XP and any levels, the fire, the rats and goblins he beat and the
// goblin camp cleared. "Got it" closes it. It waits while "What's new", the welcome or his book is open, and steps aside
// if one opens over it. systems/away.ts counts; this only words it and shows it. Changes nothing in the game.
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
 *  the level it reached), the fire, the fish he cooked, the rats he beat and the hides they left, what he finished
 *  making, and a backpack that filled with nowhere to store it or (0.0.22) practice that stopped at the training dummy's
 *  level limit, or (chapter 2) a rat that knocked him out. */
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
  if (s.cooked) lines.push(cookedText(s.cooked, s.burnt ?? 0));
  if (s.beaten) lines.push(beatenText(s.beaten, s.hides ?? 0));
  // (the goblin camp) goblins beaten, and the camp cleared
  if (s.goblins) lines.push(`He beat ${s.goblins === 1 ? 'a goblin' : `${s.goblins.toLocaleString()} goblins`}.`);
  if (s.cleared) lines.push('He beat the goblin chief, and the goblins ran off for good. He found a torn map.');
  for (const id of s.made) lines.push(`He finished the ${MAKES[id].name.toLowerCase()}.`);
  // (his needs) his meals and his nights in the shelter
  if (s.meals) lines.push(s.meals === 1 ? 'He ate a meal.' : `He ate ${s.meals.toLocaleString()} meals.`);
  if (s.nights) lines.push(s.nights === 1 ? 'He slept a night in the shelter.' : `He slept ${s.nights.toLocaleString()} nights in the shelter.`);
  if (s.full) lines.push('Then his backpack was full, with nowhere to store it.');
  // (0.0.22) he stopped at the training dummy's level limit
  if (s.taught) lines.push(`Then the ${makeDef(s.taught.target)?.name.toLowerCase() ?? 'training dummy'} couldn't teach him any more ${SKILLS[s.taught.skill].name}, so he stopped.`);
  // (chapter 2) a rat (or a goblin, the goblin chief) knocked him out: he woke up back at camp, and stopped fighting
  if (s.knockedOut) lines.push(knockedOutText(s.knockedOut, s.knockedOutBy ?? 'rat'));
  return { lead, lines };
}

/** Being knocked out: "Then a goblin knocked him out, and he woke up back at camp.", "Rats knocked him out 2 times, and
 *  each time he woke up back at camp."; by a mix of creatures, "He was knocked out 3 times, ...". */
function knockedOutText(times: number, by: NonNullable<AwaySummary['knockedOutBy']>): string {
  if (times === 1 && by !== 'mixed') return `Then ${{ rat: 'a rat', goblin: 'a goblin', chief: 'the goblin chief' }[by]} knocked him out, and he woke up back at camp.`;
  const who = by === 'rat' ? 'Rats knocked him out' : by === 'goblin' ? 'Goblins knocked him out' : by === 'chief' ? 'The goblin chief knocked him out' : 'He was knocked out';
  return `${who} ${times} times, and each time he woke up back at camp.`;
}

/** The rats he beat and the hides they left: "He beat 7 rats and found 3 rat hides." */
function beatenText(rats: number, hides: number): string {
  const beat = `He beat ${rats === 1 ? 'a rat' : `${rats.toLocaleString()} rats`}`;
  return hides ? `${beat} and found ${hides === 1 ? 'a rat hide' : `${hides.toLocaleString()} rat hides`}.` : `${beat}.`;
}

/** The fish he cooked, `burnt` of them burnt: "He cooked 6 fish, 2 of them burnt." */
function cookedText(fish: number, burnt: number): string {
  const n = fish === 1 ? 'a fish' : `${fish.toLocaleString()} fish`;
  if (!burnt) return `He cooked ${n}.`;
  if (burnt === fish) return `He cooked ${n}, but ${fish === 1 ? 'it' : 'they all'} burnt.`;
  return `He cooked ${n}, ${burnt.toLocaleString()} of them burnt.`;
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

  /** Each frame: while "What's new", the welcome or Information is open (it opens by itself as he picks up his book),
   *  the note waits, stepping aside if one opened over it (from the version button or the goal line); once none is, it
   *  shows. */
  update(): void {
    const inTheWay = !$('news').hidden || !$('intro').hidden || !$('infoWin').hidden;
    if (inTheWay && !this.panel.hidden) { this.panel.hidden = true; this.waiting = true; }
    if (!this.waiting || inTheWay) return;
    this.waiting = false;
    $('hint').classList.add('gone');                // a returning player knows how to play
    this.panel.hidden = false;
    this.ok.focus({ preventScroll: true });
  }
}
