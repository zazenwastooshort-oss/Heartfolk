// The Skills window (the UI foundation, 12 Oct 2026; opened from the Skills button, ui/windows.ts): every skill he has
// started (Mining and Woodcutting from the start, the others once they have XP), each with its icon drawn in code
// (ui/pictures.ts) in the skill's colour, its level, a bar and the XP to the next level; the skill gaining XP stands
// out. At the foot his total level, and while some skills are still to come, that they show up once started. Above
// them, once he has a weapon, the Train choice (Attack, Strength or Defence; ui/combat.ts fills and updates its
// buttons) with a line on what the one picked does. One row per skill in data/skills.ts, so a new skill shows up here
// without touching the page (it needs an icon in ui/pictures.ts). Reads state; never changes the game.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Windows } from './windows';
import type { CombatStyle } from '../data/combat';
import { SKILLS, type SkillId } from '../data/skills';
import { levelBounds, levelFor, MAX_LEVEL } from '../data/xp';
import { setText } from './hud';
import { SKILL_ICONS } from './pictures';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, className: string, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };

/** The skills shown from the start; the others (chapter 2: combat, fishing, cooking) once they have XP. */
export const FIRST_SKILLS: ReadonlySet<SkillId> = new Set(['mining', 'woodcutting']);

/** The skills the window lists: the first ones, and every other once it has XP, in data/skills.ts's order. */
export const shownSkills = (state: GameState): SkillId[] => (Object.keys(SKILLS) as SkillId[]).filter(id => state.skills[id] > 0 || FIRST_SKILLS.has(id));

/** A skill's level, how far through it (0 to 1) and its words: "1,234 xp, 766 to level 12", or at the top level just
 *  the XP and "top level". */
export function skillLine(xp: number): { level: number; progress: number; text: string } {
  const level = levelFor(xp), [lo, hi] = levelBounds(level), have = Math.floor(xp).toLocaleString();
  if (level >= MAX_LEVEL) return { level, progress: 1, text: `${have} xp, top level` };
  return { level, progress: (xp - lo) / (hi - lo), text: `${have} xp, ${Math.ceil(hi - xp).toLocaleString()} to level ${level + 1}` };
}

/** His total level: the levels of the skills the window lists, added up. */
export const totalLevel = (state: GameState) => shownSkills(state).reduce((a, id) => a + levelFor(state.skills[id]), 0);

/** What each style of the Train choice does, said under it; Vitality (his health) trains a little with every one. */
export const STYLE_WORDS: Record<CombatStyle, string> = {
  attack: 'Attack: you land more of your hits.',
  strength: 'Strength: your hits do more damage.',
  defence: 'Defence: you get hit less often.',
};
export const VITALITY_WORDS = 'Vitality, your health, grows a little with each.';

interface Row { row: HTMLElement; lvl: HTMLElement; bar: HTMLElement; text: HTMLElement }

export class SkillsWindow {
  private rows = new Map<SkillId, Row>();
  /** the skill that gained XP last, which stands out */
  private active: SkillId | null = null;

  constructor(private windows: Windows, events: EventBus) {
    for (const s of Object.values(SKILLS)) {
      const row = el('div', 'srow'), lvl = el('span', 'lvl', '1'), bar = el('i', ''), text = el('small', '');
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'icon'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = SKILL_ICONS[s.id]; icon.style.color = s.color;
      const track = el('div', 'bar'); track.append(bar); bar.style.background = s.color;
      row.append(icon, el('span', 'name', s.name), lvl, track, text); row.hidden = true;
      $('skills').append(row);
      this.rows.set(s.id, { row, lvl, bar, text });
    }
    $('trainVit').textContent = VITALITY_WORDS;
    events.on(e => { if (e.type === 'xpGained') this.active = e.skill; });
  }

  update(state: GameState): void {
    if (!this.windows.isOpen('skills')) return;
    const shown = new Set(shownSkills(state));
    for (const [id, r] of this.rows) {
      r.row.hidden = !shown.has(id);
      if (!shown.has(id)) continue;
      const line = skillLine(state.skills[id]);
      setText(r.lvl, String(line.level));
      r.bar.style.width = `${line.progress * 100}%`;
      setText(r.text, line.text);
      r.row.classList.toggle('active', id === this.active);
    }
    setText($('skillsTotal'), `Total level ${totalLevel(state)}`);
    $('skillsMore').hidden = shown.size >= this.rows.size;
    setText($('trainSays'), STYLE_WORDS[state.combatStyle]);
  }
}
