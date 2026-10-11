// The 1-99 XP curve, carried over from prototypes/wanderskill.html (XP_TABLE).
// XP_TABLE[level] is the total XP needed to reach that level.

export const MAX_LEVEL = 99;

export const XP_TABLE: readonly number[] = (() => {
  const t = [0, 0];
  let acc = 0;
  for (let n = 1; n < MAX_LEVEL; n++) {
    acc += Math.floor(n + 290 * Math.pow(2, n / 7.1));
    t[n + 1] = Math.floor(acc / 4);
  }
  return t;
})();

export const MAX_XP = XP_TABLE[MAX_LEVEL]!;

export function levelFor(xp: number): number {
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xp >= XP_TABLE[mid]!) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** XP at the start of `level` and of the next level (both equal at 99). */
export function levelBounds(level: number): [number, number] {
  return [XP_TABLE[level]!, XP_TABLE[Math.min(MAX_LEVEL, level + 1)]!];
}
