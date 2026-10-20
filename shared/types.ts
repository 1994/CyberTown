import type { ProjectResult, Skill, TeamSkills } from './rules.ts';

export type HairStyle = 'short' | 'bob' | 'spiky' | 'bun' | 'bald' | 'long' | 'cap';
export type Accessory = 'none' | 'glasses' | 'tie' | 'headset' | 'scarf' | 'sunglasses';

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
  accessory: Accessory;
}

export interface PlayerPublic {
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

export type GameEvent = TradeEvent | ProjectEvent | { kind: 'reset'; at: number } | { kind: 'presence'; at: number };

export interface FinishResponse {
  result: ProjectResult;
  coins: number;
}
