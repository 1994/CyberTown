/** 双场景主线 · 奶茶店冻结协议 v1（camelCase，前后端共用）。 */

export type TeaRole = 'cashier' | 'maker' | 'support';
export type TeaStrategy = 'balanced' | 'speed' | 'service';
export type TeaSkill =
  | 'none'
  | 'batch_master'
  | 'golden_service'
  | 'rescue_captain'
  | 'materials_saver'
  | 'steady_hand';

export interface TeaWorker {
  id: string;
  playerId: string;
  name: string;
  color: string;
  service: number;
  production: number;
  adaptability: number;
  skill: TeaSkill;
  salary: number;
  enabled: boolean;
  remaining: number;
  demo: boolean;
}

export interface TeaAssignment {
  workerId: string;
  role: TeaRole;
}

export interface TeaPlan {
  assignments: TeaAssignment[];
  stock: 20 | 40 | 60 | 80 | 100;
  strategy: TeaStrategy;
}

export interface TeaChallenge {
  id: string;
  seed: number;
  ruleVersion: string;
  name: string;
  duration: number;
  arrivals: number;
  target: number;
  budget: number;
  price: number;
  materialCost: number;
  operatingCost: number;
  shopLevel?: number;
}

export interface TeaBusiness {
  stage: 'rescue' | 'renovate' | 'regulars' | 'expand' | 'flagship' | 'complete';
  title: string;
  goal: string;
  reward: string;
  progress: number;
  target: number;
  unit: '杯' | '金币';
  challenge: TeaChallenge;
  stockOptions: TeaPlan['stock'][];
  recommendedStock: TeaPlan['stock'];
  upgradeReady: boolean;
  upgradeReason: string;
}

export interface TeaShop {
  level: number;
  best: number;
  runs: number;
  nextUpgradeCost: number;
}

export interface TeaNotice {
  id: number;
  employer: string;
  worker: string;
  role: TeaRole;
  salary: number;
  completed: number;
  cooperation: number;
  at: number;
}

export interface TeaHome {
  playerId: string;
  name: string;
  coins: number;
  self: TeaWorker;
  workers: TeaWorker[];
  shop: TeaShop;
  challenge: TeaChallenge;
  business?: TeaBusiness;
  attemptsRemaining: number;
  hireEnabled: boolean;
  notices: TeaNotice[];
  recentRuns: TeaRun[];
}

/** 每秒 frame 驱动回放；customers 为到达总数，served/lost 为累计；stock 为剩余原料（可小数）。 */
export interface TeaFrame {
  t: number;
  customers: number;
  served: number;
  lost: number;
  cashierQueue: number;
  makerQueue: number;
  stock: number;
}

export interface TeaEvent {
  t: number;
  type: string;
  customerId?: number;
  workerId?: string;
  role?: TeaRole;
  skill?: TeaSkill;
  reason?: string;
}

export interface TeaResult {
  arrivals: number;
  accepted: number;
  completed: number;
  lost: number;
  receptionRate: number;
  revenue: number;
  materialCost: number;
  wages: number;
  operatingCost: number;
  totalCost: number;
  profit: number;
  bonus: number;
  peakCashierQueue: number;
  peakMakerQueue: number;
  avgCashierWait: number;
  avgMakerWait: number;
  stockLeft: number;
  lostCashier: number;
  lostMaker: number;
  lostStock: number;
  passed: boolean;
  bottleneck: string;
  suggestion: string;
  skillCounts: Record<string, number>;
  frames: TeaFrame[];
  events: TeaEvent[];
}

export interface TeaRun {
  id: string;
  mode: 'practice' | 'official';
  challenge: TeaChallenge;
  plan: TeaPlan;
  workers: TeaWorker[];
  result: TeaResult;
  coinsAfter: number;
  settledAt: number;
}
