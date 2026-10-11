// Timings baked into assets/models/miner.glb by assets-src/export_miner_glb.py (see assets/models/miner.json).
// The simulation uses them so a swing's strike lands exactly when the animation's pick meets the rock.
import meta from '../../assets/models/miner.json';

export const ANIM = {
  mineCycle: meta.mine_cycle_s,
  mineImpact: meta.mine_impact_s,
  walkCycle: meta.walk_cycle_s,
  /** metres from a rock's centre the miner stands so the pick lands on it */
  reach: (meta as { reach_m?: number }).reach_m ?? 1.05,
};
