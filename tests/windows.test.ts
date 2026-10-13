// The UI foundation (12 Oct 2026): windows that open from a row of buttons (ui/windows.ts), one at a time on a phone and
// two side by side on a wide screen (the backpack and the book at 1280 px, by index.html's own widths); the bar at the
// foot holding his state, the goal, the buttons and the clock, with the windows standing on it (13 Oct 2026), in two rows
// on a phone (0.0.38); every window in index.html has its button (Information's the "i" beside the clock), title bar and
// close button; the goal line's words (ui/hud.ts), with its shorter counts; the Skills window's lines (ui/skills.ts) and the notices
// that point to its Train choice (ui/combat.ts); the text size remembered by Settings (ui/settings.ts); the Backpack
// button's count (ui/backpack.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EDGE, GAP, closing, fitting, opening, type Opened } from '../src/ui/windows';
import { goalLevelText, switchedText } from '../src/ui/combat';
import { DUMMY } from '../src/data/combat';
import { goalCard } from '../src/ui/hud';
import { FIRST_SKILLS, STYLE_WORDS, VITALITY_WORDS, shownSkills, skillLine, totalLevel } from '../src/ui/skills';
import { STYLES } from '../src/data/combat';
import { TEXT_SIZES, textSizeOf } from '../src/ui/settings';
import { carried } from '../src/ui/backpack';
import { createState } from '../src/core/state';
import { CAMP } from '../src/world/camp';
import { CAMP_DONE, GOALS } from '../src/data/goals';
import { MAKES } from '../src/data/making';
import { SKILLS } from '../src/data/skills';
import { MAX_XP, XP_TABLE } from '../src/data/xp';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ids = (open: Opened[]) => open.map(w => w.id);
/** A phone: one window at a time. */
const phone = (list: string[]) => list.length <= 1;
/** Each window's width, as index.html gives it (data-width). */
const WIDTHS: Record<string, number> = Object.fromEntries([...html.matchAll(/data-win="(\w+)" data-width="(\d+)"/g)].map(m => [m[1]!, Number(m[2])]));
/** A wide screen with `room` pixels across it for windows. */
const wide = (room: number) => (list: string[]) => list.reduce((a, id) => a + WIDTHS[id]!, 0) + GAP * (list.length - 1) <= room;
/** A number of pixels from index.html's CSS, found by a pattern with one group. */
const cssPx = (pattern: RegExp) => Number(html.match(pattern)?.[1]);

describe('windows: opening and closing', () => {
  it('on a phone, opening one closes the one open', () => {
    let open = opening([], 'backpack', 1, phone);
    expect(ids(open)).toEqual(['backpack']);
    open = opening(open, 'skills', 2, phone);
    expect(ids(open)).toEqual(['skills']);
    expect(ids(closing(open, 'skills'))).toEqual([]);
  });

  it('on a wide screen two stand side by side, the first next to the buttons', () => {
    const fits = wide(842);
    let open = opening([], 'backpack', 1, fits);
    open = opening(open, 'skills', 2, fits);
    expect(ids(open)).toEqual(['backpack', 'skills']);
    // a third takes the place of the one open longest, so the other stays where it is
    open = opening(open, 'settings', 3, fits);
    expect(ids(open)).toEqual(['settings', 'skills']);
    open = opening(open, 'backpack', 4, fits);
    expect(ids(open)).toEqual(['settings', 'backpack']);
    // closing one moves the other up next to the buttons
    expect(ids(closing(open, 'settings'))).toEqual(['backpack']);
  });

  it('a window too wide to stand beside the others opens alone', () => {
    const fits = wide(760);                                    // room for two of the narrow ones, not for the book beside one
    let open = opening(opening([], 'backpack', 1, fits), 'skills', 2, fits);
    expect(ids(open)).toEqual(['backpack', 'skills']);
    open = opening(open, 'book', 3, fits);
    expect(ids(open)).toEqual(['book']);
  });

  it('opening one already open changes nothing', () => {
    const open = opening([], 'book', 1, phone);
    expect(opening(open, 'book', 2, phone)).toEqual(open);
  });

  it('when the screen gets smaller, the ones open longest close until the rest fit', () => {
    const open: Opened[] = [{ id: 'backpack', at: 2 }, { id: 'skills', at: 1 }];
    expect(ids(fitting(open, wide(1000)))).toEqual(['backpack', 'skills']);
    expect(ids(fitting(open, phone))).toEqual(['backpack']);
  });
});

describe('the bar at the foot (index.html .dock; the owner, 13 Oct 2026: "a permanent bar on the bottom")', () => {
  const dock = html.slice(html.indexOf('<div class="dock" id="dock">'), html.indexOf('<div class="wins" id="wins">'));
  const top = html.slice(html.indexOf('<div class="topbar">'), html.indexOf('<div class="hint" id="hint">'));
  const at = (s: string) => dock.indexOf(s);

  it('holds his state, the goal, the row of buttons and the clock, in that order, the "i" beside the clock', () => {
    for (const id of ['strip', 'healthRow', 'hungerRow', 'xpRow', 'rested', 'fed', 'goal', 'goalOpen', 'goalBuild', 'goalGo', 'rail', 'ver', 'dial', 'clock', 'infoBtn']) {
      expect(dock, id).toContain(`id="${id}"`);
    }
    expect(at('id="strip"')).toBeLessThan(at('id="goal"'));
    expect(at('id="goal"')).toBeLessThan(at('id="rail"'));
    expect(at('id="rail"')).toBeLessThan(at('id="clock"'));
    // (0.0.38, the owner: "Yupp beside the clock") the "i" right after the clock, in the clock's own group
    expect(dock).toMatch(/<div class="dock-time">[^\n]*id="clock"[^<]*<\/div><button class="info-btn" id="infoBtn" type="button" data-opens="info"[^>]*>i<\/button><\/div>/);
  });

  it('the goal line: its name and count (opening its page), its Build button, the arrow that sends him off, a thin bar', () => {
    const goal = dock.slice(at('<div class="goal" id="goal"'), at('<nav class="rail"'));
    expect(goal).toMatch(/<button class="goal-open" id="goalOpen" type="button">\s*<span class="goal-title" id="goalTitle">[^<]*<\/span>\s*<span class="goal-count" id="goalCount">/);
    expect(goal.indexOf('id="goalOpen"')).toBeLessThan(goal.indexOf('id="goalBuild"'));
    expect(goal.indexOf('id="goalBuild"')).toBeLessThan(goal.indexOf('id="goalGo"'));
    expect(goal).toMatch(/<button class="goal-go" id="goalGo" type="button" aria-label="[^"]+"><svg class="icon"/);
    expect(goal).toContain('<span class="goal-bar" aria-hidden="true"><i id="goalBar"></i></span>');
    expect(goal).not.toContain('goalThought');              // his thought is over his head and in the journal
    // the slim line: 44 px tall, its arrow 44 px to tap, its Build button's tap area the line's height
    expect(html).toMatch(/\.goal \{[^}]*min-height: 44px;/);
    expect(html).toMatch(/\.goal-go::after \{ content: ''; position: absolute; inset: -3px -4px -3px -4px; \}/);
    expect(cssPx(/\.goal-go \{[^}]*width: (\d+)px/) + 8).toBeGreaterThanOrEqual(44);
    expect(cssPx(/\.goal-build \{[^}]*min-height: (\d+)px/) + 2 * 7).toBeGreaterThanOrEqual(44);
  });

  it('his state shows an icon for each where room is short, its words kept for the tooltip and a screen reader', () => {
    const strip = dock.slice(at('<div class="strip" id="strip">'), at('<!-- the goal line'));
    for (const id of ['healthRow', 'hungerRow', 'xpRow', 'rested', 'fed']) {
      expect(strip, id).toMatch(new RegExp(`id="${id}"[^>]*><svg class="icon st-icon"`));
    }
    for (const id of ['hungerRow', 'rested', 'fed']) expect(strip, id).toMatch(new RegExp(`id="${id}" title="[^"]+"`));
    // the words hidden only from the eye (still read out), not taken away
    expect(html).toContain('.dock.compact .pill .name, .dock.compact .chip-word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);');
  });

  it('leaves the top to the world: only the name, and with a mouse the words for what is under it', () => {
    expect(top).toContain('class="brand"');
    expect(top).toContain('id="hover"');
    for (const id of ['goal', 'clock', 'dial', 'ver', 'rested', 'strip', 'rail']) expect(top, id).not.toContain(`id="${id}"`);
  });

  it('the windows stand on the bar, below the band at the top where the hint and notices show', () => {
    const wins = html.match(/\.wins \{[^}]*\}/)?.[0] ?? '';
    expect(wins).toContain('bottom: var(--above-dock');
    expect(wins).toContain('top: calc(var(--top) + var(--band))');
    expect(wins).toContain(`gap: ${GAP}px`);
    expect(html).toMatch(/\.hint, \.notice \{[^}]*top: calc\(var\(--top\) \+ 2px\)/);
    expect(readFileSync(new URL('../src/ui/windows.ts', import.meta.url), 'utf8')).toContain("setVar('--above-dock'");
  });

  it('on a phone or a tablet held upright the bar is in two rows: his state, the goal line and the clock, then the buttons', () => {
    const rows = html.replace(/\r\n/g, '\n').slice(html.replace(/\r\n/g, '\n').indexOf('@media (max-width: 600px), (max-width: 900px) and (min-height: 600px) {'));
    expect(rows).toMatch(/^@media[^{]*\{\n  \.dock \{ flex-wrap: wrap; gap: 4px 6px; \}/);
    expect(rows).toContain('.dock > .strip { order: 1; }');
    expect(rows).toContain('.dock > .goal { order: 2; min-width: 64px; }');
    expect(rows).toContain('.dock > .dock-time { order: 3; }');
    expect(rows).toContain('.dock > .rail { order: 4; flex: 1 0 100%; }');
    // about 105 px on a phone (390 x 844; the owner's go, 13 Oct 2026, "two rows ... about 105 px"): the bar's border
    // and padding, the goal line's row (44 px), the gap and the buttons' row (48 px on a phone)
    const pad = cssPx(/\.dock \{[^}]*padding: (\d+)px/), border = cssPx(/\.dock \{[^}]*border: (\d+)px solid/);
    const button = cssPx(/@media \(max-width: 600px\) \{\s*\.rail-btn \{ min-width: \d+px; min-height: (\d+)px; \}/);
    const tall = 2 * (pad + border) + 44 + 4 + button;
    expect(button).toBeGreaterThanOrEqual(44);
    expect(tall).toBeLessThanOrEqual(110);
  });
});

describe('two windows side by side on a 1280 px wide screen (index.html)', () => {
  it('the backpack and the book fit across it, within its edges', () => {
    expect(cssPx(/--edge: (\d+)px/)).toBe(EDGE);
    const room = 1280 - 2 * EDGE;
    expect(wide(room)(['backpack', 'book'])).toBe(true);
    let open = opening([], 'backpack', 1, wide(room));
    open = opening(open, 'book', 2, wide(room));
    expect(ids(open)).toEqual(['backpack', 'book']);
  });
});

describe('windows in the page (index.html)', () => {
  const windows = [...html.matchAll(/<section class="win[^"]*" id="(\w+)" data-win="(\w+)" data-width="(\d+)"[^>]*>([\s\S]*?)<\/section>\s*(?=<section class="win|<\/div>)/g)];
  const buttons = [...html.matchAll(/<button class="rail-btn" type="button" data-opens="(\w+)" aria-controls="(\w+)"[^>]*>([\s\S]*?)<\/button>/g)];
  /** Every button on the bar that opens a window: the row's, and the "i" beside the clock (0.0.38). */
  const openers = [...html.matchAll(/<button class="(?:rail-btn|info-btn)"[^>]*? data-opens="(\w+)" aria-controls="(\w+)"[^>]*>/g)];

  it('has the windows of the row of buttons, in their order (backpack, skills, build, book, settings), then Information', () => {
    expect(windows.map(m => m[2])).toEqual(['backpack', 'skills', 'build', 'book', 'settings', 'info']);
    expect(buttons.map(m => m[1])).toEqual(['backpack', 'skills', 'build', 'book', 'settings']);
    expect(openers.map(m => m[1])).toEqual(['backpack', 'skills', 'build', 'book', 'settings', 'info']);
  });

  it('every window has a title bar with its title and a close button, and a button on the bar that opens it', () => {
    for (const [, id, win, width, body] of windows) {
      expect(body, win).toMatch(/<div class="win-bar"><h2 class="win-title" id="\w+">[^<]+<\/h2><button class="win-x" type="button" aria-label="[^"]+">/);
      expect(Number(width), win).toBeGreaterThanOrEqual(300);
      const button = openers.find(b => b[1] === win);
      expect(button, win).toBeDefined();
      expect(button![2], win).toBe(id);                      // aria-controls names the window
    }
    // Information is titled so (D9), and stands right after the Settings window
    expect(html).toMatch(/<\/section>\s*<\/div>\s*<\/section>\s*<section class="win" id="infoWin" data-win="info"[^>]*>\s*<div class="win-bar"><h2 class="win-title" id="infoTitle">Information<\/h2>/);
  });

  it('every button has an icon drawn in code and a short label', () => {
    for (const [, win, , inner] of buttons) {
      expect(inner, win).toMatch(/<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">/);
      expect(inner, win).toMatch(/<span>\w+<\/span>/);
    }
  });

  it("the book's button waits until he has his book, and the Build button until there is something to build", () => {
    const hidden = (b: RegExpMatchArray) => /^<button[^>]* hidden>/.test(b[0]);
    expect(buttons.filter(hidden).map(b => b[1])).toEqual(['build', 'book']);
  });

  it("the notes over the game share the look, and their x does what their own button does", () => {
    for (const note of ['intro', 'news', 'away']) {
      const m = html.match(new RegExp(`<div class="win note[^"]*" id="${note}"[^>]*>[\\s\\S]*?data-close="(\\w+)"[\\s\\S]*?class="win-ok" id="(\\w+)"`));
      expect(m, note).not.toBeNull();
      expect(m![1], note).toBe(m![2]);
    }
  });

  it('keeps the ids the other modules fill in (ui/combat.ts, ui/armour.ts, ui/away.ts)', () => {
    for (const id of ['healthRow', 'healthBar', 'healthText', 'trainRow', 'armourRow', 'armour', 'book', 'news', 'intro', 'away', 'awayLead', 'awayList', 'awayOk', 'floats', 'notice', 'hint']) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });
});

describe('the goal card (ui/hud.ts)', () => {
  it('a new game: the first goal and how many of each thing, the hint for a tap before he has his book', () => {
    const card = goalCard(createState(CAMP, 1));
    expect(card).toMatchObject({ title: 'Salvage the wreck', line: '0 / 7 planks, 0 / 1 tarp, 0 / 1 book', progress: 0, ready: false, build: null, hint: GOALS[0]!.hint });
  });

  it('offers the Build button once everything is there, says how far along while he builds, and Carry on once begun and he is elsewhere', () => {
    const state = createState(CAMP, 1);
    state.goalsDone = ['salvage'];
    state.player.backpack = { ...MAKES.campfire.needs };
    const card = goalCard(state);
    expect(card).toMatchObject({ title: GOALS[1]!.title, ready: true, progress: 1, build: { id: 'campfire', label: 'Build the campfire', short: 'Build', send: 'build' }, hint: GOALS[1]!.ready });
    // begun (what it needs taken): on his way, then building it, how far along; the goal stays all there
    state.player.backpack = {}; state.underway = { campfire: 0 };
    state.player.pending = { kind: 'raise', id: 'campfire' }; state.player.task = { kind: 'walk' };
    expect(goalCard(state)).toMatchObject({ build: null, line: 'On the way to build the campfire...', ready: true, progress: 1 });
    state.player.pending = null; state.player.task = { kind: 'raise', id: 'campfire' }; state.underway = { campfire: 8 };
    expect(goalCard(state)).toMatchObject({ build: null, line: 'Building the campfire... 40%', ready: true, progress: 1 });
    // sent elsewhere: Carry on
    state.player.task = { kind: 'idle' };
    expect(goalCard(state).build).toEqual({ id: 'campfire', label: 'Carry on with the campfire', short: 'Carry on', send: 'build' });
    // the firewood pile is stacked; a tool is made, where he stands
    const pile = createState(CAMP, 1);
    pile.goalsDone = ['salvage', 'campfire', 'stone_axe']; pile.built = ['campfire']; pile.tools.axe = true;
    pile.underway = { woodpile: 5 }; pile.player.task = { kind: 'raise', id: 'woodpile' };
    expect(goalCard(pile).line).toBe('Stacking the firewood pile... 20%');
    const axe = createState(CAMP, 1);
    axe.goalsDone = ['salvage', 'campfire']; axe.built = ['campfire']; axe.player.backpack = { ...MAKES.stone_axe.needs };
    expect(goalCard(axe).build).toEqual({ id: 'stone_axe', label: 'Make the stone axe', short: 'Make', send: 'make' });
    axe.player.task = { kind: 'make', id: 'stone_axe', doneAt: 99 };
    expect(goalCard(axe)).toMatchObject({ build: null, line: 'Working on the stone axe...' });
    // one thing built at a time (D8): the dummy's goal all there, with the wall tent under way, that comes first
    const dummy = createState(CAMP, 1), at = GOALS.findIndex(g => g.makes === 'dummy');
    dummy.goalsDone = GOALS.slice(0, at).map(g => g.id); dummy.built = ['campfire', 'woodpile', 'shelter', 'chest'];
    dummy.bank = { ...MAKES.dummy.needs }; dummy.underway = { wall_tent: 30 };
    expect(goalCard(dummy).build).toEqual({ id: 'wall_tent', label: 'Carry on with the wall tent', short: 'Carry on: wall tent', send: 'build' });
    dummy.player.task = { kind: 'raise', id: 'wall_tent' };
    expect(goalCard(dummy)).toMatchObject({ build: null, line: 'Building the wall tent... 25%' });
    dummy.bank = {};                                                // not all there yet: gather first, no button
    dummy.player.task = { kind: 'idle' };
    expect(goalCard(dummy).build).toBeNull();
  });

  it('where the whole count does not fit, the first thing still short, then its numbers alone (the slim goal line, 0.0.38)', () => {
    const state = createState(CAMP, 1);
    expect(goalCard(state)).toMatchObject({ line: '0 / 7 planks, 0 / 1 tarp, 0 / 1 book', short: '0 / 7 planks', tiny: '0 / 7' });
    state.player.backpack = { plank: 7 };
    expect(goalCard(state)).toMatchObject({ short: '0 / 1 tarp', tiny: '0 / 1' });
    // all there (the campfire's planks and stones, its Build button showing): the last line
    const all = createState(CAMP, 1);
    all.goalsDone = ['salvage']; all.player.backpack = { ...MAKES.campfire.needs };
    expect(goalCard(all)).toMatchObject({ short: '4 / 4 stones', tiny: '4 / 4', ready: true });
    // a skill level, by its skill
    const practice = createState(CAMP, 1);
    practice.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.id === 'practice')).map(g => g.id);
    expect(goalCard(practice)).toMatchObject({ short: 'Attack 1 / 3', tiny: '1 / 3' });
    // building in stages: how far along; on his way or making a tool, nothing more than the tag over his head says
    const fire = createState(CAMP, 1);
    fire.goalsDone = ['salvage']; fire.underway = { campfire: 8 }; fire.player.task = { kind: 'raise', id: 'campfire' };
    expect(goalCard(fire)).toMatchObject({ line: 'Building the campfire... 40%', short: 'Building... 40%', tiny: '40%' });
    fire.player.task = { kind: 'walk' }; fire.player.pending = { kind: 'raise', id: 'campfire' };
    expect(goalCard(fire)).toMatchObject({ short: 'On the way...', tiny: '' });
    // every goal done: the title says it, and the page in Information
    const done = createState(CAMP, 1);
    done.goalsDone = GOALS.map(g => g.id);
    expect(goalCard(done)).toMatchObject({ short: '', tiny: '' });
  });

  it('counts a skill level in a short line: "Attack 1 / 3"', () => {
    const state = createState(CAMP, 1);
    state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.id === 'practice')).map(g => g.id);
    expect(goalCard(state).line).toBe('Attack 1 / 3, Strength 1 / 3, Defence 1 / 3');
  });

  it('says the camp is set up once every goal is done', () => {
    const state = createState(CAMP, 1);
    state.goalsDone = GOALS.map(g => g.id);
    expect(goalCard(state)).toMatchObject({ title: CAMP_DONE.title, line: CAMP_DONE.text, ready: true, build: null });
  });
});

describe('the Skills window (ui/skills.ts)', () => {
  it('lists Mining and Woodcutting from the start, and every other skill once it has XP, in order', () => {
    const state = createState(CAMP, 1);
    expect(shownSkills(state)).toEqual([...FIRST_SKILLS]);
    state.skills.cooking = 10; state.skills.attack = 5;
    expect(shownSkills(state)).toEqual(Object.keys(SKILLS).filter(id => ['mining', 'woodcutting', 'attack', 'cooking'].includes(id)));
  });

  it('says how much XP he has and how much more the next level needs', () => {
    expect(skillLine(0)).toEqual({ level: 1, progress: 0, text: `0 xp, ${XP_TABLE[2]} to level 2` });
    const mid = (XP_TABLE[10]! + XP_TABLE[11]!) / 2, line = skillLine(mid);
    expect(line.level).toBe(10);
    expect(line.progress).toBeCloseTo(0.5);
    expect(line.text).toMatch(/ to level 11$/);
    expect(skillLine(MAX_XP)).toEqual({ level: 99, progress: 1, text: `${MAX_XP.toLocaleString()} xp, top level` });
  });

  it('adds up his total level from the skills it lists', () => {
    const state = createState(CAMP, 1);
    expect(totalLevel(state)).toBe(2);                          // Mining 1 and Woodcutting 1
    state.skills.mining = XP_TABLE[12]!; state.skills.attack = XP_TABLE[5]!;
    expect(totalLevel(state)).toBe(12 + 1 + 5);
  });

  it('says what each training style does, by its name, and that Vitality comes along', () => {
    for (const style of STYLES) expect(STYLE_WORDS[style].startsWith(`${SKILLS[style].name}: `), style).toBe(true);
    expect(VITALITY_WORDS).toContain('Vitality');
  });

  it('keeps the Train heading in the Skills window, which the notices point to ("pick ... under Train in Skills")', () => {
    expect(html).toMatch(/<div class="train" id="trainRow"[^>]*><h3 id="trainName">Train<\/h3>/);
    expect(html).toMatch(/data-opens="skills"[^>]*>[\s\S]*?<span>Skills<\/span>/);
    for (const id of ['trainSays', 'trainVit', 'skills', 'skillsTotal', 'skillsMore']) expect(html, id).toContain(`id="${id}"`);
  });

  it('the practice notices say which skill he trains now (he switches by himself, 0.0.25); Train is in Skills (ui/combat.ts)', () => {
    expect(html.match(/id="trainName">(\w+)</)?.[1]).toBe('Train');
    expect(html.match(/id="skillsTitle">(\w+)</)?.[1]).toBe('Skills');
    const state = createState(CAMP, 1);
    state.built = ['dummy'];
    state.skills.attack = XP_TABLE[DUMMY.maxLevel]!;
    expect(goalLevelText(state, 'attack', 3, 'practice', 'strength')).toContain('Now he trains Strength.');
    expect(switchedText(state, CAMP, 'dummy', 'attack', 'defence')).toContain('Now he trains Defence.');
  });
});

describe('Settings and the Backpack button', () => {
  it('remembers one of three text sizes, Normal for anything else', () => {
    expect(TEXT_SIZES).toEqual(['small', 'normal', 'large']);
    for (const s of TEXT_SIZES) expect(textSizeOf(s)).toBe(s);
    expect(textSizeOf(null)).toBe('normal');
    expect(textSizeOf('huge')).toBe('normal');
  });

  it('counts what he carries for the Backpack button', () => {
    const state = createState(CAMP, 1);
    expect(carried(state)).toBe(0);
    state.player.backpack = { birch_logs: 8, stone: 3 };
    expect(carried(state)).toBe(11);
  });
});
