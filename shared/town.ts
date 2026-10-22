import type { TeaWorker } from './tea.ts';

export type TownJobKind = 'clean' | 'stock' | 'manage' | 'rest';
export interface TownJob {
  id: string; cloneId: string; kind: TownJobKind; startedAt: number; endsAt: number;
  status: 'active' | 'completed'; reward: number; xp: number; earned: number;
}
export interface TownCandidate extends TeaWorker {
  price: number; hireCount: number; owned: boolean; avatarUrl?: string;
}
export interface TownClone extends TeaWorker {
  level: number; xp: number; nextXp: number; canStaff: boolean; canManage: boolean;
  hiredPrice: number; job: TownJob | null; avatarUrl?: string; listingId: string | null;
}
export interface TownEmployeeListing extends TeaWorker {
  sourceId: string; listingId: string; seller: TownOwner; buyerId: string | null;
  price: number; fee: number; proceeds: number; xp: number; level: number;
  listedAt: number; closedAt: number; status: 'active' | 'sold' | 'cancelled'; avatarUrl?: string;
}
export interface TownOwner { id: string; name: string; color: string; avatarUrl?: string }
export interface TownListing extends TownOwner {
  level: number; title: string; earned: number; cloneCount: number;
}
export interface TownHome {
  owner: TownOwner; visitor: boolean; level: number; title: string; earned: number;
  coins: number; serverTime: number; shopLevel: number;
  nextUpgrade: { level: number; title: string; cost: number; requiredEarned: number; ready: boolean; reason: string } | null;
  clones: TownClone[]; candidates: TownCandidate[]; jobs: TownJob[]; visitable: TownListing[];
  market: TownEmployeeListing[]; trades: TownEmployeeListing[];
}
