// The UI foundation (12 Oct 2026): windows that open from a row of buttons (ui/windows.ts), one at a time on a phone and
// two side by side on a wide screen (the backpack and the book at 1280 px, by index.html's own widths); windows making
// way for the goal card on mid-size screens (windowSpot); every window in index.html has its button, title bar and
// close button; the compact goal card's words (ui/hud.ts); the Skills window's lines (ui/skills.ts) and the notices
// that point to its Train choice (ui/combat.ts); the text size remembered by Settings (ui/settings.ts); the Backpack
// button's count (ui/backpack.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EDGE, GAP, GOAL_ROOM, MIN_BESIDE, MIN_UNDER, closing, fitting, noticeGoesLow, opening, windowSpot, type Opened, type Room } from '../src/ui/windows';
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
/** A wide screen with `room` pixels beside the buttons. */
const wide = (room: number) => (list: string[]) => list.reduce((a, id) => a + WIDTHS[id]!, 0) + GAP * (list.length - 1) <= room;
/** A number of pixels from index.html's CSS, found by a pattern with one group. */
const cssPx = (pattern: RegExp) => Number(html.match(pattern)?.[1]);
/** The row of buttons' width down the right side (index.html's --rail). */
const RAIL = cssPx(/--rail: (\d+)px/);
/** The windows' room with the buttons down the right side of a `w` x `h` screen (index.html: the screen's edge, the row
 *  of buttons and a gap), the goal card's box as measured in the game (its right and bottom edges), and the windows
 *  open, the first next to the buttons. */
const roomAt = (w: number, h: number, card: Room['card'], ...open: string[]): Room =>
  ({ right: w - EDGE - RAIL - GAP, bottom: h - EDGE, card, widths: open.map(id => WIDTHS[id]!) });

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

describe('windows make way for the goal card, so its Build button stays one tap away', () => {
  // the goal card's right and bottom edges as measured in the game (the "Build the training dummy" card, and the
  // Practice card with its three counts, at Normal and Large text)
  const build = { right: 246, bottom: 129 }, buildTablet = { right: 246, bottom: 150 }, buildLarge = { right: 280, bottom: 161 };
  const practiceLarge = { right: 325, bottom: 125 }, widest = { right: EDGE + GOAL_ROOM, bottom: 125 };

  it('on a tablet held upright (650 x 900, 768 x 1024) the book starts under the card', () => {
    expect(windowSpot(roomAt(650, 900, build, 'book'))).toBe('under');
    expect(windowSpot(roomAt(768, 1024, buildTablet, 'book'))).toBe('under');
    expect(windowSpot(roomAt(768, 1024, buildLarge, 'book'))).toBe('under');
    // the backpack clears the card there, so it stands beside the buttons from the top as usual
    expect(windowSpot(roomAt(768, 1024, buildLarge, 'backpack'))).toBe('top');
  });

  it('on a phone held sideways (844 x 390) the book stands between the card and the buttons, narrower', () => {
    const room = roomAt(844, 390, practiceLarge, 'book');
    expect(windowSpot(room)).toBe('beside');
    expect(room.right - (practiceLarge.right + GAP)).toBeGreaterThanOrEqual(MIN_BESIDE);
    expect(windowSpot(roomAt(844, 390, practiceLarge, 'backpack'))).toBe('top');
  });

  it('on a small phone held sideways (667 x 375) it takes whichever leaves more: under the card', () => {
    const room = roomAt(667, 375, widest, 'book');
    expect(room.bottom - (widest.bottom + GAP)).toBeLessThan(MIN_UNDER);
    expect(room.right - (widest.right + GAP)).toBeLessThan(MIN_BESIDE);
    expect(windowSpot(room)).toBe('under');
  });

  it('on a wide screen (1280 x 800, 1920 x 1080) two stand from the top, clear of the widest card', () => {
    expect(windowSpot(roomAt(1280, 800, widest, 'backpack', 'book'))).toBe('top');
    expect(windowSpot(roomAt(1920, 1080, widest, 'backpack', 'book'))).toBe('top');
  });

  it('with no window open, or no goal card (the village), nothing moves', () => {
    expect(windowSpot(roomAt(650, 900, build))).toBe('top');
    expect(windowSpot(roomAt(650, 900, null, 'book'))).toBe('top');
  });

  it('index.html lets the windows move under the card or beside it', () => {
    const wins = html.match(/\.wins \{[^}]*\}/)?.[0] ?? '';
    expect(wins).toContain('top: var(--wins-top, calc(var(--top) + 34px))');
    expect(wins).toContain('left: var(--wins-left, var(--edge))');
    expect(wins).toContain(`gap: ${GAP}px`);
    expect(wins).toContain(`right: calc(var(--edge) + var(--rail) + ${GAP}px)`);
  });

  it('on a phone held upright, with a window open, a notice shows above it where it leaves room, under the goal card as ever; with a tall one, below it, over the strip, clear of its title and its x', () => {
    const upright = html.slice(html.indexOf('@media (max-width: 600px)'));
    const rule = upright.match(/\.notice-low \.notice \{[^}]*\}/)?.[0] ?? '';
    const strip = upright.match(/\.strip \{ bottom: ([^;]*);/)?.[1];
    expect(rule).toContain('top: auto');
    expect(strip).toBeDefined();
    expect(rule).toContain(`bottom: ${strip}`);
    expect(readFileSync(new URL('../src/ui/windows.ts', import.meta.url), 'utf8')).toMatch(/classList\.toggle\('notice-low', low\)/);
    // at 375 x 812, the card's foot at 150: the Build window with one line ([581, 732]) leaves room above it for a
    // notice two lines high (52 px), so it shows under the card, clear of the window; the Backpack, nearly all the
    // height, doesn't, and the notice goes low
    expect(noticeGoesLow({ cardFoot: 150, windowTop: 581, notice: 52 })).toBe(false);
    expect(noticeGoesLow({ cardFoot: 150, windowTop: 166, notice: 52 })).toBe(true);
    expect(noticeGoesLow({ cardFoot: 150, windowTop: 150 + 2 * GAP + 52, notice: 52 })).toBe(false);
    expect(noticeGoesLow({ cardFoot: 150, windowTop: 150 + 2 * GAP + 51, notice: 52 })).toBe(true);
  });
});

describe('two windows side by side on a 1280 px wide screen (index.html)', () => {
  it('the gaps and the goal card are measured as index.html draws them', () => {
    expect(cssPx(/--edge: (\d+)px/)).toBe(EDGE);
    expect(cssPx(/\.goal \{[^}]*max-width: min\((\d+)px, 100%\)/)).toBe(GOAL_ROOM);
    expect(RAIL).toBeGreaterThan(0);
  });

  it('the backpack and the book fit beside each other, clear of the goal card', () => {
    // the room for windows: the screen less its edges, the row of buttons, the widest goal card and the gaps (460 px)
    const room = 1280 - EDGE - RAIL - GAP - EDGE - GOAL_ROOM - GAP;
    expect(WIDTHS.backpack! + GAP + WIDTHS.book!).toBeLessThanOrEqual(room);
    expect(wide(room)(['backpack', 'book'])).toBe(true);
    let open = opening([], 'backpack', 1, wide(room));
    open = opening(open, 'book', 2, wide(room));
    expect(ids(open)).toEqual(['backpack', 'book']);
  });
});

describe('windows in the page (index.html)', () => {
  const windows = [...html.matchAll(/<section class="win[^"]*" id="(\w+)" data-win="(\w+)" data-width="(\d+)"[^>]*>([\s\S]*?)<\/section>\s*(?=<section class="win|<\/div>)/g)];
  const buttons = [...html.matchAll(/<button class="rail-btn" type="button" data-opens="(\w+)" aria-controls="(\w+)"[^>]*>([\s\S]*?)<\/button>/g)];

  it('has the five windows, in the order of their buttons: backpack, skills, build, book, settings', () => {
    expect(windows.map(m => m[2])).toEqual(['backpack', 'skills', 'build', 'book', 'settings']);
    expect(buttons.map(m => m[1])).toEqual(['backpack', 'skills', 'build', 'book', 'settings']);
  });

  it('every window has a title bar with its title and a close button, and a button in the row that opens it', () => {
    for (const [, id, win, width, body] of windows) {
      expect(body, win).toMatch(/<div class="win-bar"><h2 class="win-title" id="\w+">[^<]+<\/h2><button class="win-x" type="button" aria-label="[^"]+">/);
      expect(Number(width), win).toBeGreaterThanOrEqual(300);
      const button = buttons.find(b => b[1] === win);
      expect(button, win).toBeDefined();
      expect(button![2], win).toBe(id);                      // aria-controls names the window
    }
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
    expect(card).toMatchObject({ title: GOALS[1]!.title, ready: true, progress: 1, build: { id: 'campfire', label: 'Build the campfire', send: 'build' }, hint: GOALS[1]!.ready });
    // begun (what it needs taken): on his way, then building it, how far along; the goal stays all there
    state.player.backpack = {}; state.underway = { campfire: 0 };
    state.player.pending = { kind: 'raise', id: 'campfire' }; state.player.task = { kind: 'walk' };
    expect(goalCard(state)).toMatchObject({ build: null, line: 'On the way to build the campfire...', ready: true, progress: 1 });
    state.player.pending = null; state.player.task = { kind: 'raise', id: 'campfire' }; state.underway = { campfire: 8 };
    expect(goalCard(state)).toMatchObject({ build: null, line: 'Building the campfire... 40%', ready: true, progress: 1 });
    // sent elsewhere: Carry on
    state.player.task = { kind: 'idle' };
    expect(goalCard(state).build).toEqual({ id: 'campfire', label: 'Carry on with the campfire', send: 'build' });
    // the firewood pile is stacked; a tool is made, where he stands
    const pile = createState(CAMP, 1);
    pile.goalsDone = ['salvage', 'campfire', 'stone_axe']; pile.built = ['campfire']; pile.tools.axe = true;
    pile.underway = { woodpile: 5 }; pile.player.task = { kind: 'raise', id: 'woodpile' };
    expect(goalCard(pile).line).toBe('Stacking the firewood pile... 20%');
    const axe = createState(CAMP, 1);
    axe.goalsDone = ['salvage', 'campfire']; axe.built = ['campfire']; axe.player.backpack = { ...MAKES.stone_axe.needs };
    expect(goalCard(axe).build).toEqual({ id: 'stone_axe', label: 'Make the stone axe', send: 'make' });
    axe.player.task = { kind: 'make', id: 'stone_axe', doneAt: 99 };
    expect(goalCard(axe)).toMatchObject({ build: null, line: 'Working on the stone axe...' });
    // one thing built at a time (D8): the dummy's goal all there, with the wall tent under way, that comes first
    const dummy = createState(CAMP, 1), at = GOALS.findIndex(g => g.makes === 'dummy');
    dummy.goalsDone = GOALS.slice(0, at).map(g => g.id); dummy.built = ['campfire', 'woodpile', 'shelter', 'chest'];
    dummy.bank = { ...MAKES.dummy.needs }; dummy.underway = { wall_tent: 30 };
    expect(goalCard(dummy).build).toEqual({ id: 'wall_tent', label: 'Carry on with the wall tent', send: 'build' });
    dummy.player.task = { kind: 'raise', id: 'wall_tent' };
    expect(goalCard(dummy)).toMatchObject({ build: null, line: 'Building the wall tent... 25%' });
    dummy.bank = {};                                                // not all there yet: gather first, no button
    dummy.player.task = { kind: 'idle' };
    expect(goalCard(dummy).build).toBeNull();
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
