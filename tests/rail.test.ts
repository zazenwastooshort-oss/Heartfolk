// The row of buttons in the bar at the foot (the rustic UI pass, then the bar, 13 Oct 2026; ui/rail.ts): how many buttons
// stay in the row at each size (railShows, in the room railRoom gives) and which go into a More button's menu, in order
// (railSplit); its measures as index.html draws them; and the hand-inked icons (ui/pictures.ts) for every button.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DOCK_GAP, DOCK_PAD, GOAL_MIN, RAIL_PHONE, RAIL_WIDE, ROWS_MAX, ROWS_TALL, SHORT_MAX, UPRIGHT_MAX, inRows, railRoom, railShows, railSplit } from '../src/ui/rail';
import { CLOSE_ICON, RAIL_ICONS } from '../src/ui/pictures';
import { EDGE } from '../src/ui/windows';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
/** The buttons in a page's row, with whether each waits hidden (the book's, Build's). */
const buttonsOf = (page: string) => [...page.matchAll(/<button class="rail-btn" type="button" data-opens="(\w+)"[^>]*>/g)].map(m => ({ id: m[1]!, hidden: / hidden>$/.test(m[0]) }));

/** The sizes checked: a phone held upright, a small phone and a phone held sideways, a tablet both ways, a desktop. */
const SIZES = { upright: [390, 844], small: [667, 375], sideways: [844, 390], tabletUp: [768, 1024], tabletSide: [1024, 768], desktop: [1280, 800] } as const;
type Size = keyof typeof SIZES;
/** What stands beside the row on the bar where it shares one row (px, as measured in the game, gaps included): his
 *  state and the clock; on a phone held sideways two pills stacked and the clock (What's new keeps to 900 px and wider),
 *  wider, the pills in a line and What's new too. */
const BESIDE: Record<Size, number> = { upright: 0, small: 230, sideways: 230, tabletUp: 0, tabletSide: 400, desktop: 400 };
const roomAt = (size: Size) => railRoom(SIZES[size][0], SIZES[size][1], BESIDE[size]);
/** How many of `count` buttons stay in the row at `size`. */
const shows = (count: number, size: Size) => { const { room, measure } = roomAt(size); return railShows(count, room, measure); };

describe('the row of buttons: how many fit (railShows)', () => {
  it('the bar is in rows on a phone and a tablet held upright (the row has one of its own), one row otherwise', () => {
    expect(inRows(...SIZES.upright)).toBe(true);
    expect(inRows(...SIZES.tabletUp)).toBe(true);
    for (const size of ['small', 'sideways', 'tabletSide', 'desktop'] as Size[]) expect(inRows(SIZES[size][0], SIZES[size][1]), size).toBe(false);
  });

  it('five buttons (all there are today) fit at every size but the smallest phone held sideways, where three stay and More holds two', () => {
    for (const size of ['upright', 'sideways', 'tabletUp', 'tabletSide', 'desktop'] as Size[]) expect(shows(5, size), size).toBe(5);
    expect(shows(5, 'small')).toBe(3);
  });

  it('six fit on a phone held upright or sideways, a tablet both ways and a desktop', () => {
    for (const size of ['upright', 'sideways', 'tabletUp', 'tabletSide', 'desktop'] as Size[]) expect(shows(6, size), size).toBe(6);
  });

  it('eight: five and More upright, six and More sideways or on a tablet held sideways, all of them on a tablet held upright or a desktop', () => {
    expect(shows(8, 'upright')).toBe(5);
    expect(shows(8, 'sideways')).toBe(6);
    expect(shows(8, 'tabletSide')).toBe(6);
    expect(shows(8, 'tabletUp')).toBe(8);
    expect(shows(8, 'desktop')).toBe(8);
  });

  it('the ones that stay and More always fit in the room, and never fewer stay than could', () => {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 10]) {
      for (const [w, h] of [...Object.values(SIZES), [360, 740], [740, 360], [667, 320], [320, 568]] as [number, number][]) {
        const { room, measure } = railRoom(w, h, inRows(w, h) ? 0 : 230), n = railShows(count, room, measure);
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

  it("beside his state and the clock, the row has what the bar leaves after the goal's least width", () => {
    const { room } = railRoom(1280, 800, 400);
    expect(room).toBe(1280 - 2 * EDGE - DOCK_PAD - 400 - GOAL_MIN - DOCK_GAP);
    expect(railRoom(390, 844, 999).room).toBe(390 - 2 * EDGE - DOCK_PAD);                     // in rows: the whole bar
    expect(railRoom(844, 390).measure).toBe(RAIL_PHONE);                                       // a phone held sideways
    expect(railRoom(1024, 768).measure).toBe(RAIL_WIDE);
  });
});

describe('the row of buttons: which stay and which go into More (railSplit)', () => {
  const b = (id: string, hidden = false) => ({ id, hidden });
  const ids = (list: { id: string }[]) => list.map(x => x.id);
  const row6 = (hide: string[] = []) => ['backpack', 'jobs', 'skills', 'build', 'book', 'settings'].map(id => b(id, hide.includes(id)));
  /** Room for four phone-sized buttons and More, not for six. */
  const ROOM = 300;

  it('six showing where four and More fit: the first four stay in their order, the last two go into More in theirs', () => {
    const { row, menu } = railSplit(row6(), ROOM, RAIL_PHONE);
    expect(ids(row)).toEqual(['backpack', 'jobs', 'skills', 'build']);
    expect(ids(menu)).toEqual(['book', 'settings']);
  });

  it('a hidden button takes no room and stays in the row out of sight (the book before he has it)', () => {
    const { row, menu } = railSplit(row6(['book']), ROOM, RAIL_PHONE);
    expect(ids(row)).toEqual(['backpack', 'jobs', 'skills', 'build', 'book', 'settings']);
    expect(menu).toEqual([]);
    // two hidden: a hidden one before the cut doesn't count among the four that stay
    const more = railSplit([...row6(['build']), b('extra1'), b('extra2')], ROOM, RAIL_PHONE);
    expect(ids(more.menu)).toEqual(['settings', 'extra1', 'extra2']);
    expect(ids(more.row)).toEqual(['backpack', 'jobs', 'skills', 'build', 'book']);
  });

  it('all stay on a tablet or a desktop, and before the row has been measured', () => {
    for (const size of ['tabletUp', 'tabletSide', 'desktop'] as Size[]) {
      const { room, measure } = roomAt(size);
      expect(railSplit(row6(), room, measure).menu, size).toEqual([]);
    }
    expect(railSplit(row6(), 0, RAIL_WIDE).menu).toEqual([]);
  });

  it('eight on a phone held upright: five stay, More holds three', () => {
    const { room, measure } = roomAt('upright');
    const { row, menu } = railSplit([...row6(), b('extra1'), b('extra2')], room, measure);
    expect(ids(row)).toEqual(['backpack', 'jobs', 'skills', 'build', 'book']);
    expect(ids(menu)).toEqual(['settings', 'extra1', 'extra2']);
  });
});

describe('the row in the page (index.html)', () => {
  const css = (pattern: RegExp) => html.match(pattern)?.[1];
  /** The CSS rule for a selector at the start of a line, as written. */
  const rule = (selector: string) => html.split('\n').map(l => l.replace(/\r$/, '')).reduce<string>((found, line, i, lines) => {
    if (found || !line.startsWith(`${selector} {`)) return found;
    let text = '';
    for (let k = i; k < lines.length; k++) { text += lines[k] + '\n'; if (lines[k]!.includes('}')) break; }
    return text;
  }, '');

  it('a sixth button added hidden in this test takes no room until it shows; shown, it goes into More with the last ones', () => {
    const real = buttonsOf(html);
    // a temporary extra button, only here, at the row's end
    const extra = '<button class="rail-btn" type="button" data-opens="test" aria-controls="testWin" aria-expanded="false" hidden>';
    const page = html.replace('</nav>', `${extra}<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"></svg><span>Test</span></button></nav>`);
    const parsed = buttonsOf(page);
    expect(parsed).toHaveLength(real.length + 1);
    expect(parsed.at(-1)).toEqual({ id: 'test', hidden: true });
    const { room, measure } = roomAt('small');
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
    const keep = railShows(parsed.length, room, measure);
    expect(ids(shown.row)).toEqual(ids(parsed).slice(0, keep));
    expect(ids(shown.menu)).toEqual(ids(parsed).slice(keep));
    expect(ids(shown.menu).at(-1)).toBe('test');
  });

  it('the Build button can be reached on the narrowest phones (360, 375 and 667 px, upright and sideways): in the row, or in More', () => {
    // (the camp build: the Build window is the camp's overview) every button showing, the book's and Build's too
    const real = buttonsOf(html).map(b => ({ ...b, hidden: false }));
    expect(real.map(b => b.id)).toContain('build');
    for (const [w, h] of [[360, 740], [375, 812], [740, 360], [812, 375], [667, 375]] as [number, number][]) {
      const { room, measure } = railRoom(w, h, inRows(w, h) ? 0 : 230), { row, menu } = railSplit(real, room, measure);
      expect(row.some(b => b.id === 'build') || menu.some(b => b.id === 'build'), `${w}x${h}`).toBe(true);
      // what stays in the row, and More when there is one, fits along it
      const n = row.length + (menu.length ? 1 : 0);
      expect(n * measure.size + (n - 1) * measure.gap + measure.pad, `${w}x${h}`).toBeLessThanOrEqual(room);
    }
  });

  it('measures the row and the bar as index.html draws them', () => {
    // the buttons: 60 px wide at least, 54 on a phone (narrow or short); 3 px apart; the row has no padding of its own
    expect(css(/\.rail-btn \{[^}]*min-width: (\d+)px/)).toBe(String(RAIL_WIDE.size));
    expect(html.replace(/\r\n/g, '\n')).toContain(`@media (max-width: ${UPRIGHT_MAX}px) {\n  .rail-btn { min-width: ${RAIL_PHONE.size}px; }`);
    expect(html).toContain(`@media (max-height: ${SHORT_MAX}px) { .goal-thought { display: none; } .rail-btn { min-width: ${RAIL_PHONE.size}px; } }`);
    const rail = rule('.rail');
    expect(rail).toContain(`gap: ${RAIL_WIDE.gap}px`);
    expect(RAIL_PHONE.gap).toBe(RAIL_WIDE.gap);
    expect(rail).not.toContain('padding');
    expect(RAIL_WIDE.pad).toBe(0);
    expect(RAIL_PHONE.pad).toBe(0);
    // the bar: 5 px padding and a 1 px border at each end, 8 px between the things on it; the goal keeps 120 px at least
    const dock = rule('.dock');
    expect(dock).toContain('padding: 5px');
    expect(dock).toContain('border: 1px solid');
    expect(DOCK_PAD).toBe(2 * 5 + 2 * 1);
    expect(dock).toContain(`gap: ${DOCK_GAP}px`);
    expect(css(/\.goal \{[^}]*min-width: (\d+)px/)).toBe(String(GOAL_MIN));
    // in rows on a phone or a tablet held upright
    expect(html).toContain(`@media (max-width: ${UPRIGHT_MAX}px), (max-width: ${ROWS_MAX}px) and (min-height: ${ROWS_TALL}px) {`);
    expect(css(/--edge: (\d+)px/)).toBe(String(EDGE));
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
