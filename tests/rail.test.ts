// The rustic UI pass (13 Oct 2026): the row of buttons keeps from overflowing (ui/rail.ts): how many buttons stay in the
// row at each size (railShows) and which go into a More button's menu, in order (railSplit); its measures as index.html
// draws them; and the hand-inked icons (ui/pictures.ts) for every button in the row, the Jobs window's included.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RAIL_SIDE, RAIL_TOP, RAIL_UPRIGHT, UPRIGHT_MAX, railRoom, railShows, railSplit } from '../src/ui/rail';
import { CLOSE_ICON, RAIL_ICONS } from '../src/ui/pictures';
import { EDGE } from '../src/ui/windows';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
/** The buttons in a page's row, with whether each waits hidden (the book's, Build's). */
const buttonsOf = (page: string) => [...page.matchAll(/<button class="rail-btn" type="button" data-opens="(\w+)"[^>]*>/g)].map(m => ({ id: m[1]!, hidden: / hidden>$/.test(m[0]) }));
/** How many of `count` buttons stay in the row on a `w` x `h` screen. */
const shows = (count: number, w: number, h: number) => { const { room, measure } = railRoom(w, h); return railShows(count, room, measure); };

/** The sizes checked: a phone held upright and sideways, a tablet both ways, a desktop. */
const SIZES = { upright: [390, 844], sideways: [844, 390], tabletUp: [768, 1024], tabletSide: [1024, 768], desktop: [1280, 800] } as const;

describe('the row of buttons: how many fit (railShows)', () => {
  it('five buttons fit at every size', () => {
    for (const [name, [w, h]] of Object.entries(SIZES)) expect(shows(5, w, h), name).toBe(5);
  });

  it('six fit on a phone held upright, a tablet and a desktop; held sideways four stay and More holds two', () => {
    expect(shows(6, ...SIZES.upright)).toBe(6);
    expect(shows(6, ...SIZES.sideways)).toBe(4);
    expect(shows(6, ...SIZES.tabletUp)).toBe(6);
    expect(shows(6, ...SIZES.tabletSide)).toBe(6);
    expect(shows(6, ...SIZES.desktop)).toBe(6);
  });

  it('eight: five and More upright, four and More sideways, all of them on a tablet or a desktop', () => {
    expect(shows(8, ...SIZES.upright)).toBe(5);
    expect(shows(8, ...SIZES.sideways)).toBe(4);
    expect(shows(8, ...SIZES.tabletUp)).toBe(8);
    expect(shows(8, ...SIZES.tabletSide)).toBe(8);
    expect(shows(8, ...SIZES.desktop)).toBe(8);
  });

  it('the ones that stay and More always fit in the room, and never fewer stay than could', () => {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 10]) {
      for (const [w, h] of [...Object.values(SIZES), [360, 740], [740, 360], [667, 320], [320, 568]] as [number, number][]) {
        const { room, measure } = railRoom(w, h), n = railShows(count, room, measure);
        const length = (k: number) => k * measure.size + Math.max(0, k - 1) * measure.gap + measure.pad;
        expect(n, `${count} at ${w}x${h}`).toBeGreaterThanOrEqual(1);
        expect(n, `${count} at ${w}x${h}`).toBeLessThanOrEqual(count);
        if (n === count) expect(length(n)).toBeLessThanOrEqual(room);
        else {
          if (n > 1) expect(length(n + 1), `${count} at ${w}x${h}`).toBeLessThanOrEqual(room);   // the buttons and More
          expect(length(n + 2), `${count} at ${w}x${h}`).toBeGreaterThan(room);                // one more wouldn't fit
        }
      }
    }
  });

  it('a short phone held sideways (a browser bar taking some height) keeps three and More for five (320 px tall)', () => {
    expect(shows(5, 740, 320)).toBe(3);
  });
});

describe('the row of buttons: which stay and which go into More (railSplit)', () => {
  const b = (id: string, hidden = false) => ({ id, hidden });
  const ids = (list: { id: string }[]) => list.map(x => x.id);
  const row6 = (hide: string[] = []) => ['backpack', 'jobs', 'skills', 'build', 'book', 'settings'].map(id => b(id, hide.includes(id)));

  it('six showing held sideways: the first four stay in their order, the last two go into More in theirs', () => {
    const { room, measure } = railRoom(...SIZES.sideways);
    const { row, menu } = railSplit(row6(), room, measure);
    expect(ids(row)).toEqual(['backpack', 'jobs', 'skills', 'build']);
    expect(ids(menu)).toEqual(['book', 'settings']);
  });

  it('a hidden button takes no room and stays in the row out of sight (the book before he has it)', () => {
    const { room, measure } = railRoom(...SIZES.sideways);
    const { row, menu } = railSplit(row6(['book']), room, measure);
    expect(ids(row)).toEqual(['backpack', 'jobs', 'skills', 'build', 'book', 'settings']);
    expect(menu).toEqual([]);
    // two hidden: a hidden one before the cut doesn't count among the four that stay
    const more = railSplit([...row6(['build']), b('extra1'), b('extra2')], room, measure);
    expect(ids(more.menu)).toEqual(['settings', 'extra1', 'extra2']);
    expect(ids(more.row)).toEqual(['backpack', 'jobs', 'skills', 'build', 'book']);
  });

  it('all stay on a tablet or a desktop, and before the row has been measured', () => {
    for (const [w, h] of [SIZES.tabletUp, SIZES.tabletSide, SIZES.desktop]) {
      const { room, measure } = railRoom(w, h);
      expect(railSplit(row6(), room, measure).menu).toEqual([]);
    }
    expect(railSplit(row6(), 0, RAIL_SIDE).menu).toEqual([]);
  });

  it('eight on a phone held upright: five stay, More holds three', () => {
    const { room, measure } = railRoom(...SIZES.upright);
    const { row, menu } = railSplit([...row6(), b('extra1'), b('extra2')], room, measure);
    expect(ids(row)).toEqual(['backpack', 'jobs', 'skills', 'build', 'book']);
    expect(ids(menu)).toEqual(['settings', 'extra1', 'extra2']);
  });
});

describe('the row in the page (index.html)', () => {
  const css = (pattern: RegExp) => html.match(pattern)?.[1];

  // (these follow the page's own buttons, so another window's button, the Jobs window's, needs no change here)
  it('held sideways, all its buttons fit while there are five or fewer, else four stay and More holds the rest', () => {
    const real = buttonsOf(html);
    expect(real.length).toBeGreaterThanOrEqual(5);
    expect(shows(real.length, ...SIZES.sideways)).toBe(real.length <= 5 ? real.length : 4);
  });

  it('a sixth button added hidden in this test takes no room until it shows; shown, it goes into More with the last ones', () => {
    const real = buttonsOf(html);
    // a temporary extra button, only here, at the row's end
    const extra = '<button class="rail-btn" type="button" data-opens="test" aria-controls="testWin" aria-expanded="false" hidden>';
    const page = html.replace('</nav>', `${extra}<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"></svg><span>Test</span></button></nav>`);
    const parsed = buttonsOf(page);
    expect(parsed).toHaveLength(real.length + 1);
    expect(parsed.at(-1)).toEqual({ id: 'test', hidden: true });
    const { room, measure } = railRoom(...SIZES.sideways);
    const ids = (list: { id: string }[]) => list.map(b => b.id);
    // every real button showing (the book's and Build's once he has them), the test one still hidden: the row splits
    // as it does without it, and the hidden one stays in the row out of sight
    const waiting = parsed.map(b => ({ ...b, hidden: b.id === 'test' }));
    const alone = railSplit(real.map(b => ({ ...b, hidden: false })), room, measure);
    const split = railSplit(waiting, room, measure);
    expect(ids(split.menu)).toEqual(ids(alone.menu));
    expect(ids(split.row)).toEqual([...ids(alone.row), 'test']);
    // shown: the first ones stay in their order, and More holds the rest in theirs, the test button last
    const shown = railSplit(waiting.map(b => ({ ...b, hidden: false })), room, measure);
    const keep = shows(parsed.length, ...SIZES.sideways);
    expect(ids(shown.row)).toEqual(ids(parsed).slice(0, keep));
    expect(ids(shown.menu)).toEqual(ids(parsed).slice(keep));
    expect(ids(shown.menu).at(-1)).toBe('test');
  });

  it("measures the row as index.html draws it", () => {
    expect(css(/\.rail-btn \{[^}]*min-height: (\d+)px/)).toBe(String(RAIL_SIDE.size));
    expect(css(/@media \(max-width: (\d+)px\)[^{]*\{\s*\.rail \{/)).toBe(String(UPRIGHT_MAX));
    expect(css(/\.rail-btn \{ flex: 1 1 0; min-width: (\d+)px/)).toBe(String(RAIL_UPRIGHT.size));
    const rail = html.match(/\.rail \{[^}]*\}/)![0];
    expect(rail).toContain(`gap: ${RAIL_SIDE.gap}px`);
    expect(RAIL_UPRIGHT.gap).toBe(RAIL_SIDE.gap);
    // down the side: 6 px padding at each end and a 1 px border; upright: 5 px and the border
    expect(rail).toContain('padding: 6px 5px');
    expect(rail).toContain('border: 1px solid');
    expect(RAIL_SIDE.pad).toBe(2 * 6 + 2 * 1);
    expect(html).toMatch(/\.rail \{ top: auto;[^}]*padding: 4px 5px; \}/);
    expect(RAIL_UPRIGHT.pad).toBe(2 * 5 + 2 * 1);
    // where it starts down the side: the top bar's 10 px and 34 px under it
    expect(html).toContain('--top: calc(10px + env(safe-area-inset-top, 0px))');
    expect(rail).toContain('top: calc(var(--top) + 34px)');
    expect(RAIL_TOP).toBe(10 + 34);
    expect(css(/--edge: (\d+)px/)).toBe(String(EDGE));
  });

  it('the room the row may take is measured from an invisible box over it', () => {
    expect(html).toMatch(/\.rail-room \{[^}]*top: calc\(var\(--top\) \+ 34px\); bottom: calc\(var\(--edge\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });
});

describe('the hand-inked icons (ui/pictures.ts)', () => {
  it('every button in the row has its icon, and so do the Jobs window and More', () => {
    for (const { id } of buttonsOf(html)) expect(RAIL_ICONS[id], id).toBeTruthy();
    expect(RAIL_ICONS.jobs).toBeTruthy();
    expect(RAIL_ICONS.more).toBeTruthy();
    expect(CLOSE_ICON).toContain('<path');
  });

  it('are line drawings on the 24 x 24 grid: paths only, no fills', () => {
    for (const [id, svg] of Object.entries({ ...RAIL_ICONS, close: CLOSE_ICON })) {
      expect(svg, id).toMatch(/^<path /);
      expect(svg, id).not.toMatch(/fill=/);
      for (const n of svg.match(/-?\d*\.?\d+/g)!.map(Number)) expect(Math.abs(n), id).toBeLessThanOrEqual(24);
    }
  });

  it('no two buttons share an icon', () => {
    const icons = Object.values(RAIL_ICONS);
    expect(new Set(icons).size).toBe(icons.length);
  });
});
