// Timings baked into assets/models/miner.glb by assets-src/export_miner_glb.py (see assets/models/miner.json).
// The simulation uses them so a swing's strike lands exactly when the animation's tool meets the rock or trunk.
import meta from '../../assets/models/miner.json';
import type { GatherSkill, ToolId } from './skills';

/** How a skill's swing looks and lands: the clip in miner.glb and the tool in hand (which he must own to work this
 *  skill at all), the length of one swing and the moment in it the tool strikes (seconds), and where to stand:
 *  `reach` metres from the centre of a node whose radius is `refRadius`, further back from bigger nodes (thicker
 *  trunks). */
export interface Swing { clip: string; tool: ToolId; cycle: number; impact: number; reach: number; refRadius: number }

export const SWINGS: Record<GatherSkill, Swing> = {
  // every rock has radius 0.95 in the layout; the reach was measured on the rock model itself
  mining: { clip: 'Mine', tool: 'pick', cycle: meta.mine_cycle_s, impact: meta.mine_impact_s, reach: meta.reach_m, refRadius: 0.95 },
  woodcutting: { clip: 'Chop', tool: 'axe', cycle: meta.chop_cycle_s, impact: meta.chop_impact_s, reach: meta.chop_reach_m, refRadius: meta.chop_trunk_m },
};

/** How the character gets about: `speed` metres a second on the ground (doubled from walking pace at the owner's
 *  request, 11 Oct; stamina may come later), drawn with `freeClip` (the tool on his back, arms swinging) on every
 *  walk, to work included: he takes the tool out only when he gets there (the owner, 11 Oct). `clip` is the same
 *  stride with the tool in his hands, unused for now (like Walk) but kept in miner.glb. Both strides cover
 *  `clipSpeed` metres a second at their own pace, so the view plays them speed / clipSpeed times as fast and the feet
 *  don't slide. */
export const GAIT = { clip: 'Run', freeClip: 'RunFree', speed: 2.9, clipSpeed: meta.run_speed_m_s };

/** Standing: `clip` with the tool in his hands (at work, waiting at a stump or an empty rock), `freeClip` with it
 *  on his back and his arms at his sides. */
export const IDLE = { clip: 'Idle', freeClip: 'IdleFree' };

/** The clips in miner.glb that hold the tool in both hands; the arm IK keeps the hands on its handle in these alone
 *  (src/render/arms.ts). The free clips carry it on his back. */
export const ARMED_CLIPS: ReadonlySet<string> = new Set([IDLE.clip, 'Walk', GAIT.clip, ...Object.values(SWINGS).map(s => s.clip)]);

/** Crossfade between two clips, in seconds. A swap between an armed and a free clip (the tool going between his
 *  hands and his back) is quicker: the tool is hidden while it happens and the arms pass close to his chest. */
export const FADE = { normal: 0.18, swap: 0.12 };

/** A walk to a tree or rock shorter than this (metres, along his path) keeps the tool in his hands: hopping on to the
 *  next one while he works, it doesn't go onto his back and out again (the owner, 12 Oct 2026). Longer walks carry
 *  it on his back. */
export const SHORT_HOP = 8;
