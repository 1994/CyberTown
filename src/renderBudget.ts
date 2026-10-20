export const BALANCED_LEVELS = [
  { dpr: 1.25, multisampling: 2, shadow: 1024, shadowHz: 20 },
  { dpr: 1, multisampling: 2, shadow: 768, shadowHz: 15 },
  { dpr: 0.85, multisampling: 2, shadow: 512, shadowHz: 10 },
] as const;

export interface BudgetTrend { slow: number; fast: number }

/** Two slow 2-second windows lower quality; six healthy windows restore one level. */
export function nextRenderBudget(tier: number, trend: BudgetTrend, medianMs: number) {
  if (!Number.isFinite(medianMs) || medianMs <= 0) return { tier, trend: { slow: 0, fast: 0 } };
  const slow = medianMs > 26 ? trend.slow + 1 : 0;
  const fast = medianMs < 19 ? trend.fast + 1 : 0;
  if (slow >= 2) return { tier: Math.min(BALANCED_LEVELS.length - 1, tier + 1), trend: { slow: 0, fast: 0 } };
  if (fast >= 6) return { tier: Math.max(0, tier - 1), trend: { slow: 0, fast: 0 } };
  return { tier, trend: { slow, fast } };
}
