import type { ProjectResult, Skill, TeamSkills } from './rules.ts';

export type HairStyle =
  'short' | 'bob' | 'spiky' | 'bun' | 'bald' | 'long' | 'cap';
export type Accessory =
  'none' | 'glasses' | 'tie' | 'headset' | 'scarf' | 'sunglasses' | 'neon-mask' | 'fox-mask';

export interface Look {
  /** Face-mask image; empty or failed URLs use the generated identity portrait. */
  avatarUrl?: string;
  avatarName?: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
  accessory: Accessory;
}

export interface PlayerPublic {
  avatarUrl?: string;
  id: string;
  name: string;
  title: string;
  color: string;
  coins: number;
  teamValue: number; // 队员身价合计（按各自最近成交价）
  assets: number; // coins + teamValue
  teamSize: number;
  avatarColleagueId: string | null;
  online: boolean;
  rank: number;
  rankName: string;
  style: PlayerStyle;
}

export interface ColleagueView {
  id: string;
  name: string;
  title: string;
  bio: string;
  look: Look;
  skill: Skill;
  selfPlayerId: string | null; // 该同事是否为某位可登录玩家的「分身」
  ownerId: string | null;
  deskSlot: number | null;
  lastPrice: number | null; // 最近成交价（未被签约过为 null）
  price: number; // 下一位买家需支付的价格
  trades: number;
  earnings: number; // 分身本人累计 5% 分红（虚拟同事记在其个人钱包）
  version: number;
  acquiredAt: number | null;
}

export interface MessageView {
  id: number;
  scope: 'me' | 'global';
  kind: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  data?: Record<string, unknown>;
}

export interface ProjectRunView {
  id: string;
  seed: number;
  startedAt: number;
  durationMs: number;
  deadline: number;
  skills: TeamSkills;
  status: 'active' | 'claimed' | 'expired';
}

export interface StateSnapshot {
  serverTime: number;
  version: number;
  me: PlayerPublic;
  players: PlayerPublic[];
  colleagues: ColleagueView[];
  teamSkills: TeamSkills;
  projectSkills: TeamSkills;
  career: Career;
  year: GameYear;
  shop: ShopItem[];
  activeRun: ProjectRunView | null;
  messages: MessageView[];
  unread: number;
  systemPool: number;
}

export interface TradeEvent {
  kind: 'trade';
  colleagueId: string;
  colleagueName: string;
  buyerId: string;
  sellerId: string | null;
  selfPlayerId: string | null;
  price: number;
  ownerShare: number;
  selfShare: number;
  systemShare: number;
  deskSlot: number;
  previousDeskSlot: number | null;
  at: number;
}

export interface ProjectEvent {
  kind: 'project';
  playerId: string;
  total: number;
  at: number;
}

export interface HighfiveEvent {
  kind: 'highfive';
  playerId: string;
  targetId: string;
  reward: number;
  at: number;
}

export type GameEvent =
  | { kind: 'town_changed'; playerId: string }
  | TradeEvent
  | ProjectEvent
  | HighfiveEvent
  | PromotionEvent
  | {
      kind: 'reset' | 'presence' | 'shop' | 'style' | 'avatar' | 'identity';
      at: number;
      playerId?: string;
    };

// ───────────── 多人园区（/api/world） ─────────────

export type EmoteKind = 'wave' | 'dance' | 'coffee';

/** 在线玩家在园区中的位置与社交状态（只包含当前有 SSE 连接的测试身份） */
export interface WorldPlayer {
  id: string;
  townId?: string;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  emote: string;
  emoteUntil: number;
  said: string;
  saidUntil: number;
  updatedAt: number;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WorldSnapshot {
  serverTime: number;
  bounds: WorldBounds;
  players: WorldPlayer[];
  onlineCount?: number;
  nearbyCount?: number;
  radius?: number;
}

export interface FinishResponse {
  result: ProjectResult;
  coins: number;
  performanceEarned: number;
  career: Career;
  yearAward: YearAward | null;
}

export interface CareerLevel {
  rank: number;
  name: string;
  requiredPerformance: number;
  requiredProjects: number;
  incomePct: number;
}
export interface Career {
  rank: number;
  name: string;
  performance: number;
  completedProjects: number;
  incomePct: number;
  next: CareerLevel | null;
  canPromote: boolean;
}
export interface PromotionEvent {
  kind: 'promotion';
  playerId: string;
  fromRank: number;
  toRank: number;
  rankName: string;
  incomePct: number;
  at: number;
}
export interface YearAward {
  year: number;
  base: number;
  teamPct: number;
  playPct: number;
  friendPct: number;
  total: number;
}
export interface GameYear {
  number: number;
  completed: number;
  required: number;
  base: number;
  estimate: number;
  teamPct: number;
  playPct: number;
  friendPct: number;
  lastAward: YearAward | null;
}
export interface PlayerStyle {
  shirt: string;
  accessory: string;
  aura: string;
  bossShirt: string;
  bossAccessory: string;
  bossAura: string;
}
export interface ShopItem {
  id: string;
  name: string;
  kind: 'shirt' | 'accessory' | 'aura' | 'vehicle';
  price: number;
  value: string;
  description: string;
  owned: boolean;
}
