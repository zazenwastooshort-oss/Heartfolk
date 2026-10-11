// Timings baked into assets/models/miner.glb by assets-src/export_miner_glb.py (see assets/models/miner.json).
// The simulation uses them so a swing's strike lands exactly when the animation's tool meets the rock or trunk.
import meta from '../../assets/models/miner.json';
import type { SkillId } from './skills';

/** How a skill's swing looks and lands: the clip in miner.glb and the tool in hand, the length of one swing and the
 *  moment in it the tool strikes (seconds), and where to stand: `reach` metres from the centre of a node whose
 *  radius is `refRadius`, further back from bigger nodes (thicker trunks). */
export interface Swing { clip: string; tool: 'pick' | 'axe'; cycle: number; impact: number; reach: number; refRadius: number }

export const SWINGS: Record<SkillId, Swing> = {
  // every rock has radius 0.95 in the layout; the reach was measured on the rock model itself
  mining: { clip: 'Mine', tool: 'pick', cycle: meta.mine_cycle_s, impact: meta.mine_impact_s, reach: meta.reach_m, refRadius: 0.95 },
  woodcutting: { clip: 'Chop', tool: 'axe', cycle: meta.chop_cycle_s, impact: meta.chop_impact_s, reach: meta.chop_reach_m, refRadius: meta.chop_trunk_m },
};

/** How the character gets about: `speed` metres a second on the ground (doubled from walking pace at the owner's
 *  request, 11 Oct; stamina may come later), drawn with `clip`, whose stride covers `clipSpeed` metres a second at
 *  its own pace, so the view plays it speed / clipSpeed times as fast and the feet don't slide. */
export const GAIT = { clip: 'Run', speed: 2.9, clipSpeed: meta.run_speed_m_s };
