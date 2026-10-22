import opportunities from '../gameplay/town-opportunities.json' with { type: 'json' };

export interface TownOpportunity {
  id: string; name: string; district: 'commerce' | 'leisure';
  x: number; z: number; reward: number; insight: string;
}
export interface TownOpportunityState extends TownOpportunity { visitedAt: number }
export interface TownExploration {
  visited: number; total: number; rewardTotal: number;
  firstShopComplete: boolean; chainReady: boolean;
  opportunities: TownOpportunityState[];
}
/** Shared source for server proximity/rewards, map destinations and scene markers. */
export const TOWN_OPPORTUNITIES = opportunities as readonly TownOpportunity[];
