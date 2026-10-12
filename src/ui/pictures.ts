// Pictures drawn in code (the UI foundation, part 2, 12 Oct 2026): a small picture for every thing he can carry (ITEMS in
// data/skills.ts) and every piece of gear he can wear (GEAR in data/combat.ts), for the Backpack window's slots, what he
// wears and what is stored; and a line icon for every skill (SKILLS), for the Skills window. Placeholder art, kept
// simple: flat colours with a dark outline, like an old game's inventory icons, on a 32 x 32 grid; the colours follow
// the models (render/gear.ts, render/bushes.ts, render/cooking.ts, the camp's rocks and logs). A new item, piece of gear
// or skill needs a picture here; tests/backpack.test.ts checks every one has its own. Anything without one shows a
// plain bundle meanwhile. Only builds strings of SVG: no page, no game state.
import type { GearId, Slot } from '../data/combat';
import type { SkillId } from '../data/skills';

/** The outline every picture's shapes share. */
const INK = '#21170e';
/** A shape's outline, as attributes. */
const lined = `stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"`;
/** A line drawn twice, dark and wider under its colour, so a stick or a handle has an outline too. */
const stick = (d: string, color: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width + 2.4}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A lump of rock with flecks of ore in `fleck`. */
const ore = (fleck: string) =>
  `<path d="M5.5 22 8 13.5 14 8.5l8.5.5 5 6.5-1 8-7.5 3.5H10z" fill="#8d877d" ${lined}/>` +
  `<path d="M8.6 13.8 14.2 9.4l4 3.4-6 4z" fill="#a8a296"/><path d="M19.6 25.4l6.2-2.8.8-6.9-5 3.8z" fill="#716b62"/>` +
  `<circle cx="13" cy="19.5" r="2.4" fill="${fleck}" ${lined}/><circle cx="19.5" cy="14.5" r="2" fill="${fleck}" ${lined}/>` +
  `<circle cx="21" cy="21" r="1.5" fill="${fleck}" ${lined}/>`;

/** A log lying from bottom left to top right: its bark, the marks on it, and its cut end. */
const log = (bark: string, marks: string, end: string, ring: string) =>
  `<g transform="rotate(-38 16 16)"><rect x="3" y="11" width="23" height="10" rx="3" fill="${bark}" ${lined}/>` +
  `<path d="${marks}" fill="none" stroke="${INK}" stroke-opacity=".75" stroke-width="1.2" stroke-linecap="round"/>` +
  `<ellipse cx="26" cy="16" rx="3.3" ry="5" fill="${end}" ${lined}/><ellipse cx="26" cy="16" rx="1.5" ry="2.5" fill="none" stroke="${ring}" stroke-width="1"/></g>`;

/** A fish facing left in `body`, with `extra` drawn over it (grill marks). */
const fish = (body: string, gill: string, extra = '') =>
  `<path d="M15.5 10.2 18 6.6l2.6 3.9z" fill="${body}" ${lined}/>` +
  `<path d="M3.5 16C6.5 10.5 13.5 8.6 19.5 10c2.7.6 4.6 2 5.8 3.4L29 10l-1 6 1 6-3.7-3.4C24.1 20 22.2 21.4 19.5 22 13.5 23.4 6.5 21.5 3.5 16z" fill="${body}" ${lined}/>` +
  `<path d="M12.3 12c-1 2.6-1 5.4 0 8" fill="none" stroke="${gill}" stroke-width="1.1" stroke-linecap="round"/>${extra}` +
  `<circle cx="8.6" cy="14.6" r="1.4" fill="${INK}"/>`;

/** Every thing he can carry (ITEMS in data/skills.ts), as the inside of a 32 x 32 SVG. */
export const ITEM_PICTURES: Record<string, string> = {
  copper_ore: ore('#4fae7f'),
  tin_ore: ore('#e2e5e9'),
  iron_ore: ore('#b4694a'),
  birch_logs: log('#ece4cf', 'M8 13.5h3M15 18.5h3.5M19 13.4h2.5M10 18.6h1.5', '#e2c48e', '#b88d55'),
  oak_logs: log('#7b5a3c', 'M6 14h9M12 18h10M17 14.2h5', '#d2a86c', '#9c7343'),
  plank: `<g transform="rotate(-38 16 16)"><rect x="1.5" y="12.5" width="29" height="7" rx="1" fill="#c09463" ${lined}/>` +
    `<path d="M5 15h8.5M16.5 17.2h10M8 17.4h4.5M20 14.8h4" fill="none" stroke="#8e6538" stroke-width="1" stroke-linecap="round"/>` +
    `<circle cx="5.2" cy="16" r="1" fill="#4a4743"/><circle cx="26.6" cy="16" r="1" fill="#4a4743"/></g>`,
  tarp: `<path d="M5.5 8.5 25 6.5l1 11.5-2 2 3 2.4-4 3.1-14.5.9z" fill="#d8c39a" ${lined}/>` +
    `<path d="M16 7.5 25 6.5l1 11.5-2 2 3 2.4-4 3.1-6 .4z" fill="#c4ad82"/>` +
    `<path d="M7 16.5l18.5-1.8M16 7.6l1.4 17.8" fill="none" stroke="#a48d63" stroke-width="1.1" stroke-linecap="round"/>` +
    `<path d="M5.5 8.5 25 6.5l1 11.5-2 2 3 2.4-4 3.1-14.5.9z" fill="none" ${lined}/>`,
  stone: `<path d="M6.5 20.5c0-5.3 4.3-9.5 10-9.5S26.5 14.4 26.5 19.5 22 26.5 16.2 26.5 6.5 25.6 6.5 20.5z" fill="#9b988f" ${lined}/>` +
    `<path d="M10.8 16.6c1.6-2 4.2-3.1 7-2.9" fill="none" stroke="#cbc8bf" stroke-width="1.7" stroke-linecap="round"/>`,
  branch: stick('M6 26.5 24.5 7', '#7a5634', 2.6) + stick('M14.5 17.8l7.5 1.4', '#7a5634', 1.8) + stick('M19.8 11.8 18.6 5.8', '#7a5634', 1.6) +
    `<path d="M22.2 19.3c2.2-2.6 5.2-2.6 6.4-1.6-1 2.4-3.8 3.6-6.4 1.6z" fill="#6c9a46" ${lined}/>`,
  berries: `<path d="M16 9.5c.6-2.2 2.2-3.6 4.4-4" fill="none" stroke="#5a7a34" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M17.2 7.6c2.4-2.6 6.4-2.8 8-1.6-1.4 3-5.4 3.8-8 1.6z" fill="#5f9440" ${lined}/>` +
    `<circle cx="11.5" cy="20" r="5.2" fill="#a8263a" ${lined}/><circle cx="20.8" cy="20.6" r="5.2" fill="#c4364a" ${lined}/>` +
    `<circle cx="16" cy="13.2" r="5" fill="#cf3346" ${lined}/>` +
    `<circle cx="14.4" cy="11.6" r="1.3" fill="#f6d2d0" fill-opacity=".85"/><circle cx="9.9" cy="18.3" r="1.2" fill="#f6d2d0" fill-opacity=".7"/>` +
    `<circle cx="19.2" cy="19" r="1.2" fill="#f6d2d0" fill-opacity=".7"/>`,
  raw_fish: fish('#a3b5bc', '#6c8088', `<path d="M6.5 18c3.6 2.6 8.6 3.4 13 2.4" fill="none" stroke="#dbe5e7" stroke-width="1.4" stroke-linecap="round"/>`),
  cooked_fish: fish('#bf7d40', '#7a4a22', `<path d="M15.6 11.2 13.4 20.8M20.2 11 18.2 21M24 13.4l-1.6 6" fill="none" stroke="#6b3f1c" stroke-width="1.5" stroke-linecap="round"/>`),
  burnt_fish: fish('#3d3531', '#1e1916', `<path d="M15.6 11.2 13.4 20.8M20.2 11 18.2 21" fill="none" stroke="#1a1512" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M22 7.6c-1.6-1.4 1-2.8-.4-4.4M25.4 8.4c-1.2-1.2.8-2.2-.3-3.4" fill="none" stroke="#a49e95" stroke-width="1.2" stroke-linecap="round"/>`),
  rat_hide: `<path d="M16 24c.4 3 2.6 4.6 5.2 4.8" fill="none" stroke="#d4a093" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M8.5 7.5l4.5 2.5h6l4.5-2.5-1.2 5.2L25.5 18l-3.2 2.8 1.2 5.2-4.5-2h-6l-4.5 2 1.2-5.2L6.5 18l3.2-5.3z" fill="#8f7b67" ${lined}/>` +
    `<ellipse cx="16" cy="17" rx="5" ry="5.6" fill="#a8937d"/>` +
    `<path d="M16 12.4v9.4" fill="none" stroke="#efe2c2" stroke-width="1" stroke-dasharray="1.6 1.4" stroke-linecap="round"/>`,
};

/** Every piece of gear (GEAR in data/combat.ts), as the inside of a 32 x 32 SVG. Colours from render/gear.ts. */
export const GEAR_PICTURES: Record<GearId, string> = {
  stone_club: stick('M8 27 18.5 13.5', '#6f5034', 3.4) +
    `<path d="M15.2 10.5c0-3.8 3-6.6 6.6-6.6s6.4 2.8 6.4 6.4-3 6.8-6.6 6.8-6.4-2.8-6.4-6.6z" fill="#8a867f" ${lined}/>` +
    `<path d="M18 8.2c1-1.6 2.8-2.4 4.6-2.2" fill="none" stroke="#b2aea6" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M14.6 14.6l3.6 2.6 1.6-2.2-3.6-2.6z" fill="#b39867" ${lined}/>`,
  hide_cap: `<path d="M6.5 20.5C6.5 12.5 10.6 8 16 8s9.5 4.5 9.5 12.5z" fill="#a4774a" ${lined}/>` +
    `<path d="M3.5 20.5h25c0 2.4-1.6 3.6-3.6 3.6H7.1c-2 0-3.6-1.2-3.6-3.6z" fill="#77532f" ${lined}/>` +
    `<path d="M16 9v10.5M10.5 12.5c1.8 1.4 3.6 2 5.5 2s3.7-.6 5.5-2" fill="none" stroke="#efe2c2" stroke-width="1" stroke-dasharray="1.6 1.4" stroke-linecap="round"/>`,
  hide_vest: `<path d="M10 5.5h3c.5 2.6 1.6 3.8 3 3.8s2.5-1.2 3-3.8h3l5 4.2-2.2 5.2-1.8-.9V27H9V14l-1.8.9L5 9.7z" fill="#a4774a" ${lined}/>` +
    `<path d="M16 9.6V27M9 21h14" fill="none" stroke="#77532f" stroke-width="1.2"/>` +
    `<path d="M13.8 12.5l4.4 2M18.2 12.5l-4.4 2M13.8 16.5l4.4 2M18.2 16.5l-4.4 2" fill="none" stroke="#efe2c2" stroke-width="1" stroke-linecap="round"/>` +
    `<path d="M11 6.5c.8 3.4 1 5.8.4 8.2M21 6.5c-.8 3.4-1 5.8-.4 8.2" fill="none" stroke="#77532f" stroke-width="1.1" stroke-linecap="round"/>`,
  hide_shield: `<circle cx="16" cy="16" r="11.5" fill="#8a5f3a" ${lined}/><circle cx="16" cy="16" r="8.6" fill="#a4774a" ${lined}/>` +
    `<circle cx="16" cy="16" r="6.6" fill="none" stroke="#efe2c2" stroke-width="1" stroke-dasharray="1.6 1.5"/>` +
    `<circle cx="16" cy="16" r="2.6" fill="#77532f" ${lined}/>`,
};

/** What an empty slot of what he wears shows, faintly: the shape of a piece that goes there. */
export const SLOT_SHAPES: Record<Slot, GearId> = { weapon: 'stone_club', head: 'hide_cap', body: 'hide_vest', shield: 'hide_shield' };

/** A plain bundle, for anything without its own picture yet. */
export const BUNDLE = `<path d="M8 13c0-2 2-3.5 4-3.5h8c2 0 4 1.5 4 3.5l1.5 10c.3 2-1.2 3.5-3.2 3.5H9.7c-2 0-3.5-1.5-3.2-3.5z" fill="#b49e74" ${lined}/>` +
  `<path d="M11.5 9.6 13 5.5h6l1.5 4.1" fill="#c9b48a" ${lined}/><path d="M11 13.5h10" fill="none" stroke="#7d6a48" stroke-width="1.3" stroke-linecap="round"/>`;

/** Whether a thing (an item or a piece of gear) has a picture of its own. */
export const hasPicture = (id: string) => Object.hasOwn(ITEM_PICTURES, id) || Object.hasOwn(GEAR_PICTURES, id);

/** A thing's picture (an item or a piece of gear) as a whole SVG element, or the bundle when it has none. */
export function picture(id: string, className = 'item-pic'): string {
  const inner = Object.hasOwn(ITEM_PICTURES, id) ? ITEM_PICTURES[id] : Object.hasOwn(GEAR_PICTURES, id) ? GEAR_PICTURES[id as GearId] : BUNDLE;
  return `<svg class="${className}" viewBox="0 0 32 32" aria-hidden="true">${inner}</svg>`;
}

/** Every skill's icon (SKILLS in data/skills.ts): cream-style lines on a 24 x 24 grid, drawn in the skill's colour by
 *  the page (index.html's .icon). A pickaxe, an axe, a sword, a flexed arm, a shield, a heart, a fish, a pot. */
export const SKILL_ICONS: Record<SkillId, string> = {
  mining: '<path d="M4 9.5c4.5-4.6 11.5-4.6 16 0"/><path d="M12 6.4V21"/>',
  woodcutting: '<path d="M6 20.5 15.5 7"/><path d="M13.6 5.2c3.4-1.4 7.4.8 7 5.2l-5.2-1.6z"/>',
  attack: '<path d="M19.5 4.5 9.5 14.5"/><path d="M6.5 11.5l6 6"/><path d="M8.5 15.5l-4 4"/>',
  strength: '<path d="M3 17.5h14c2.5 0 4-2 3.5-4.5L18 6.5c-.4-1.2-1.4-2-2.7-2h-2.1c-1.2 0-1.8 1.4-1 2.3l2.3 2.2-.9 1.9c-1.1-1.4-3.2-2.1-5.2-1.6-1.9.5-3.8 1.6-5.4 2.7"/>',
  defence: '<path d="M12 3.5 19 6v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/>',
  vitality: '<path d="M12 19.5c-6-4-8-7-8-10C4 7 6 5 8.5 5c1.5 0 2.8.8 3.5 2 .7-1.2 2-2 3.5-2C18 5 20 7 20 9.5c0 3-2 6-8 10z"/>',
  fishing: '<path d="M3.5 12c2.5-4 7.5-5 11.5-3.5l5.5-3v13l-5.5-3c-4 1.5-9 .5-11.5-3.5z"/><circle cx="7.6" cy="11.4" r=".5"/>',
  cooking: '<path d="M5 11h14v4c0 3-2 4.5-4.5 4.5h-5C7 19.5 5 18 5 15z"/><path d="M3 12h2M19 12h2"/><path d="M10 8c-1-1.4 1-2.2 0-3.6M14 8c-1-1.4 1-2.2 0-3.6"/>',
};
