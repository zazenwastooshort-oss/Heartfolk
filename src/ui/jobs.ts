// The Jobs window (the idle core, 12 Oct 2026; opened from the Jobs button, ui/windows.ts): his job now, with what he
// is up to and a Stop button, then every job there is somewhere to do here (data/jobs.ts; core/jobs.ts says which, and
// why one can't be picked yet: "Needs a stone axe"), each with the picture of what it brings in. A tap on one sends the
// job command (systems/jobs.ts): he fetches his tools at the chest and gets on with it by himself. A tap on one he
// can't do yet is refused, saying why. The notices that go with jobs are here too. Reads state; never changes the game.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Command } from '../systems/commands';
import type { Layout } from '../world/layout';
import type { Windows } from './windows';
import type { Hud } from './hud';
import { jobBlock, jobHere, type JobBlock } from '../core/jobs';
import { JOBS, jobDef, type JobId } from '../data/jobs';
import { MAKES } from '../data/making';
import { SKILLS, TOOLS } from '../data/skills';
import { setText } from './hud';
import { picture } from './pictures';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, className: string, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };

/** Why a job can't be picked yet, as its row (and the refusal) says it: "Needs a stone axe." (the thing he makes for the
 *  tool, where there is one), "Needs Woodcutting level 10.", "Build the training dummy first." */
export function blockText(block: JobBlock): string {
  switch (block.kind) {
    case 'tool': {
      const make = Object.values(MAKES).find(m => m.gives.kind === 'tool' && m.gives.tool === block.tool);
      const name = make ? make.name.toLowerCase() : TOOLS[block.tool].name.toLowerCase();
      return `Needs ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}.`;
    }
    case 'level': return `Needs ${SKILLS[block.skill].name} level ${block.level}.`;
    case 'build': return `Build the ${MAKES[block.make].name.toLowerCase()} first.`;
    case 'weapon': return 'Needs a weapon. A stone club will do.';
    case 'taught': return 'The dummy has taught him all it can.';
    case 'fish': return 'No raw fish to cook. Catch some first.';
    case 'none': return 'Nowhere to do that here.';
  }
}

const nameOf = (id: JobId) => jobDef(id)?.name ?? id;
/** "chop birch", for the middle of a sentence */
const lower = (id: JobId) => nameOf(id).charAt(0).toLowerCase() + nameOf(id).slice(1);

/** What he is up to with his job, in a line under it in the window. */
export function jobStatus(state: GameState, layout: Layout): string {
  const job = state.job, p = state.player, n = state.needs;
  if (!job) return 'Pick one, and he gets on with it by himself.';
  const store = layout.buildings.some(b => b.kind === 'bank') ? 'bank' : 'chest';
  if (p.task.kind === 'knockedOut') return "Knocked out. He goes back to it once he's up.";
  if (p.task.kind === 'sleep' || n.bed) return 'Asleep, or off to bed. He starts again at first light.';
  if (p.stoke) return 'Seeing to the fire. He goes back to it after.';
  if (n.meal) return 'Off for a bite to eat. He goes back to it after.';
  if (job.paused) return 'Paused while he does what you asked. He goes back to it after.';
  if (job.fetch) return `Fetching his tools from the ${store}.`;
  if (p.trip) return `Taking a full backpack to the ${store}.`;
  return 'Hard at it.';
}

interface Row { row: HTMLButtonElement; line: HTMLElement }

export class JobsWindow {
  private rows = new Map<JobId, Row>();

  constructor(private windows: Windows, queue: Command[], private layout: Layout, events: EventBus, hud: Hud) {
    for (const def of JOBS) {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'job'; row.hidden = true;
      const pic = el('span', 'job-pic'); pic.innerHTML = picture(def.picture); pic.setAttribute('aria-hidden', 'true');
      const words = el('span', 'job-words'), line = el('small', '', def.what);
      words.append(el('b', '', def.name), line);
      row.append(pic, words);
      row.addEventListener('click', () => queue.push({ type: 'job', job: def.id }));
      $('jobsList').append(row);
      this.rows.set(def.id, { row, line });
    }
    $('jobStop').addEventListener('click', () => queue.push({ type: 'stopJob' }));
    events.on(e => {
      if (e.type === 'jobSet') {
        const store = layout.buildings.some(b => b.kind === 'bank') ? 'bank' : 'chest';
        hud.notice(`New job: ${lower(e.job)}.${e.later ? ' He starts as soon as he can.' : e.fetch ? ` First he fetches his tools from the ${store}.` : ''}`);
      }
      else if (e.type === 'jobRefused') hud.notice(`${nameOf(e.job)}: ${blockText(e.block).charAt(0).toLowerCase()}${blockText(e.block).slice(1)}`);
      else if (e.type === 'jobResumed') hud.notice(`Back to his job: ${lower(e.job)}.`);
      else if (e.type === 'jobStopped') hud.notice(stoppedText(e.job, e.why, e.block));
    });
  }

  update(state: GameState): void {
    if (!this.windows.isOpen('jobs')) return;
    const job = state.job;
    setText($('jobNowName'), job ? nameOf(job.id) : 'No job');
    setText($('jobNowText'), jobStatus(state, this.layout));
    ($('jobStop') as HTMLButtonElement).hidden = !job;
    for (const def of JOBS) {
      const r = this.rows.get(def.id)!, here = jobHere(state, this.layout, def);
      r.row.hidden = !here;
      if (!here) continue;
      const block = jobBlock(state, this.layout, def), on = job?.id === def.id;
      setText(r.line, block ? blockText(block) : def.what);
      r.row.classList.toggle('blocked', !!block);
      r.row.classList.toggle('on', on);
      r.row.setAttribute('aria-pressed', String(on));
    }
  }
}

/** Why his job stopped, in a notice. */
export function stoppedText(job: JobId, why: 'player' | 'blocked' | 'full' | 'noPath' | 'done', block?: JobBlock): string {
  if (why === 'player') return `He stops ${jobDef(job)?.doing ?? lower(job)} for now.`;
  if (why === 'done') return `That's all the fish cooked. Job done.`;
  if (why === 'full') return "His backpack is full and there's nowhere to store it yet, so he stops his job.";
  if (why === 'noPath') return "He can't find a way there, so he stops his job.";
  return `${nameOf(job)} stops: ${block ? blockText(block).charAt(0).toLowerCase() + blockText(block).slice(1) : 'he can\'t go on.'}`;
}
