export const BALANCED_LEVELS = [
  { dpr: 1.5, multisampling: 4, shadow: 1024, shadowHz: 20 },
  { dpr: 1.25, multisampling: 2, shadow: 768, shadowHz: 15 },
  { dpr: 1, multisampling: 2, shadow: 512, shadowHz: 10 },
] as const;

export interface BudgetTrend { slow: number; fast: number }

/** Two slow 2-second windows lower quality; six healthy windows restore one level. */
export function nextRenderBudget(tier: number, trend: BudgetTrend, medianMs: number, p95Ms = medianMs) {
  if (!Number.isFinite(medianMs) || medianMs <= 0 || !Number.isFinite(p95Ms) || p95Ms <= 0) return { tier, trend: { slow: 0, fast: 0 } };
  const slow = medianMs > 20.5 || p95Ms > 34 ? trend.slow + 1 : 0;
  const fast = medianMs < 17.5 && p95Ms < 23 ? trend.fast + 1 : 0;
  if (slow >= 2) return { tier: Math.min(BALANCED_LEVELS.length - 1, tier + 1), trend: { slow: 0, fast: 0 } };
  if (fast >= 6) return { tier: Math.max(0, tier - 1), trend: { slow: 0, fast: 0 } };
  return { tier, trend: { slow, fast } };
}

/** Keep a native-resolution floor; never blur the entire town to save effects.
 * The 3M pixel budget bounds supersampling on tablets and large monitors. */
export function scenePixelRatio(width: number, height: number, target: number) {
  if (![width,height,target].every(Number.isFinite) || width <= 0 || height <= 0) return 1;
  return Math.max(1, Math.min(target, Math.sqrt(3_000_000 / (width * height))));
}
