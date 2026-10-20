// 共享游戏规则：服务端是唯一权威，前端仅用于展示与预览（同一份代码，保证展示数值与结算一致）。
// 所有金币均为整数；所有取整规则在此集中定义。

export const START_COINS = 600;
export const INITIAL_PRICE = 300;
export const MAX_TEAM = 3;

export const OWNER_SHARE_PCT = 90;
export const SELF_SHARE_PCT = 5;

/** 再挖角价 = ceil(前价 × 1.25 / 10) × 10，纯整数运算避免浮点误差。 */
export function nextPrice(prev: number): number {
  if (!Number.isInteger(prev) || prev <= 0) throw new Error('price must be positive integer');
  return Math.floor((prev * 125 + 999) / 1000) * 10;
}

/** 当前签约/挖角所需价格：从未被签约过 → 初签价 300；否则按上一次成交价上调。 */
export function priceFor(lastPrice: number | null): number {
  return lastPrice == null ? INITIAL_PRICE : nextPrice(lastPrice);
}

export interface PaymentSplit {
  price: number;
  ownerShare: number; // 原持有人所得（初签无原持有人 → 0，该 90% 并入系统回收）
  selfShare: number; // 分身本人所得
  systemShare: number; // 系统回收 = 价格 − 以上两项（吸收所有向下取整的零头）
}

/**
 * 资金拆分（整数，向下取整）：
 * - 原持有人 floor(price × 90 / 100)
 * - 分身本人 floor(price × 5 / 100)
 * - 系统回收 = price − 原持有人 − 分身本人（因此三者之和恒等于 price，零头归系统）
 * 初签（无原持有人）时原持有人份额为 0，原本 90% 的部分作为「人才市场入职费」由系统回收。
 */
export function splitPayment(price: number, hasPreviousOwner: boolean): PaymentSplit {
  const ownerShare = hasPreviousOwner ? Math.floor((price * OWNER_SHARE_PCT) / 100) : 0;
  const selfShare = Math.floor((price * SELF_SHARE_PCT) / 100);
  return { price, ownerShare, selfShare, systemShare: price - ownerShare - selfShare };
}

// ───────────────────────── 技能 ─────────────────────────

export type SkillKind = 'income' | 'time' | 'shield';

export interface Skill {
  kind: SkillKind;
  value: number;
}

export interface TeamSkills {
  incomePct: number; // 项目收益加成 %
  timeSec: number; // 项目时长延长（秒）
  shield: number; // 连击保护次数
}

export const MAX_TIME_BONUS_SEC = 6;
export const MAX_INCOME_PCT = 75;
export const MAX_SHIELD = 4;

export const SKILL_META: Record<SkillKind, { name: string; icon: string; color: string; describe: (v: number) => string }> = {
  income: { name: '业绩光环', icon: '💰', color: '#ffc94d', describe: (v) => `项目收益 +${v}%` },
  time: { name: '时间管理', icon: '⏱️', color: '#5ee1ff', describe: (v) => `项目时长 +${v} 秒` },
  shield: { name: '甩锅护盾', icon: '🛡️', color: '#b18cff', describe: (v) => `失误 ${v} 次不断连击` },
};

export function teamSkills(skills: Skill[]): TeamSkills {
  const t: TeamSkills = { incomePct: 0, timeSec: 0, shield: 0 };
  for (const s of skills) {
    if (s.kind === 'income') t.incomePct += s.value;
    else if (s.kind === 'time') t.timeSec += s.value;
    else if (s.kind === 'shield') t.shield += s.value;
  }
  t.incomePct = Math.min(t.incomePct, MAX_INCOME_PCT);
  t.timeSec = Math.min(t.timeSec, MAX_TIME_BONUS_SEC);
  t.shield = Math.min(t.shield, MAX_SHIELD);
  return t;
}

// ───────────────────────── 紧急项目小游戏 ─────────────────────────

export const BASE_PROJECT_MS = 15_000;
/** 允许的提前结算容差（网络/时钟差），早于 截止时间−容差 的结算被拒绝 */
export const FINISH_EARLY_TOLERANCE_MS = 300;
/** 截止后多长时间内仍可结算，超过视为过期（奖励作废） */
export const FINISH_GRACE_MS = 30_000;
/** 两次有效点击的最小间隔（人类极限以下视为脚本） */
export const MIN_ACTION_GAP_MS = 90;
export const MAX_ACTIONS = 200;

export type TaskKind = 'mail' | 'bug' | 'meeting' | 'report' | 'trap';

export const TASK_META: Record<TaskKind, { label: string; icon: string; color: string; good: boolean }> = {
  mail: { label: '回复客户邮件', icon: '📧', color: '#5ec8ff', good: true },
  bug: { label: '修复线上 Bug', icon: '🐞', color: '#ff7a7a', good: true },
  meeting: { label: '搞定甲方会议', icon: '📅', color: '#7dffa8', good: true },
  report: { label: '交周报', icon: '📊', color: '#ffd166', good: true },
  trap: { label: '老板画的大饼', icon: '🥧', color: '#9a9a9a', good: false },
};

export interface ProjectTask {
  id: number;
  kind: TaskKind;
  lane: number; // 0..LANES-1
  spawnAt: number; // 相对开始的毫秒
  ttl: number; // 存活毫秒
}

export const LANES = 5;

/** 确定性伪随机（mulberry32），服务端与客户端由同一种子生成同一任务序列 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTasks(seed: number, durationMs: number): ProjectTask[] {
  const r = rng(seed);
  const tasks: ProjectTask[] = [];
  const kinds: TaskKind[] = ['mail', 'bug', 'meeting', 'report'];
  let t = 500;
  let id = 0;
  let lastLane = -1;
  while (t < durationMs - 900) {
    const trap = r() < 0.16;
    let lane = Math.floor(r() * LANES);
    if (lane === lastLane) lane = (lane + 1 + Math.floor(r() * (LANES - 1))) % LANES;
    lastLane = lane;
    const kind: TaskKind = trap ? 'trap' : kinds[Math.floor(r() * kinds.length)];
    const ttl = trap ? 1900 : 2300 - Math.min(700, Math.floor(t / 30));
    tasks.push({ id: id++, kind, lane, spawnAt: t, ttl: Math.min(ttl, durationMs - t) });
    t += 420 + Math.floor(r() * 330);
  }
  return tasks;
}

export interface ProjectAction {
  taskId: number;
  t: number; // 相对开始的毫秒（客户端上报，服务端只在合理窗口内采信）
}

export interface ProjectResult {
  hits: number;
  misses: number;
  traps: number;
  shieldsUsed: number;
  maxCombo: number;
  rejected: number; // 被服务端判定无效的上报（越界/重复/过快/不存在）
  basePoints: number;
  incomeBonus: number;
  total: number;
}

export function pointsForCombo(combo: number): number {
  // 第 1 连击 8 分，每多 1 连击 +2，最高 24 分
  return 8 + 2 * Math.min(combo - 1, 8);
}

/**
 * 结算（服务端权威）：只采信落在任务存活窗口内、且不重复、间隔合理的点击。
 * 未点击的有效任务在过期时刻记为失误；点击陷阱也算失误。失误会打断连击，除非还有护盾。
 * 收益加成：total = floor(basePoints × (100 + incomePct) / 100)。
 */
export function scoreProject(
  tasks: ProjectTask[],
  rawActions: ProjectAction[],
  skills: TeamSkills,
  durationMs: number,
  elapsedMs: number,
): ProjectResult {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<number>();
  const valid: ProjectAction[] = [];
  let rejected = 0;
  const actions = rawActions
    .slice(0, MAX_ACTIONS)
    .filter((a) => a && Number.isInteger(a.taskId) && Number.isFinite(a.t))
    .sort((a, b) => a.t - b.t);
  rejected += rawActions.length - actions.length;
  let lastT = -Infinity;
  for (const a of actions) {
    const task = byId.get(a.taskId);
    const limit = Math.min(durationMs, elapsedMs);
    if (!task || seen.has(a.taskId) || a.t < task.spawnAt || a.t > task.spawnAt + task.ttl || a.t > limit || a.t - lastT < MIN_ACTION_GAP_MS) {
      rejected++;
      continue;
    }
    seen.add(a.taskId);
    valid.push(a);
    lastT = a.t;
  }

  type Ev = { t: number; type: 'hit' | 'miss' | 'trap' };
  const events: Ev[] = [];
  for (const a of valid) events.push({ t: a.t, type: byId.get(a.taskId)!.kind === 'trap' ? 'trap' : 'hit' });
  for (const task of tasks) {
    if (task.kind !== 'trap' && !seen.has(task.id)) events.push({ t: task.spawnAt + task.ttl, type: 'miss' });
  }
  events.sort((a, b) => a.t - b.t);

  let combo = 0;
  let maxCombo = 0;
  let shieldLeft = skills.shield;
  let basePoints = 0;
  let hits = 0;
  let misses = 0;
  let traps = 0;
  let shieldsUsed = 0;
  for (const e of events) {
    if (e.type === 'hit') {
      combo++;
      hits++;
      maxCombo = Math.max(maxCombo, combo);
      basePoints += pointsForCombo(combo);
    } else {
      if (e.type === 'miss') misses++;
      else traps++;
      if (shieldLeft > 0) {
        shieldLeft--;
        shieldsUsed++;
      } else combo = 0;
    }
  }
  const total = Math.floor((basePoints * (100 + skills.incomePct)) / 100);
  return { hits, misses, traps, shieldsUsed, maxCombo, rejected, basePoints, incomeBonus: total - basePoints, total };
}

export function projectDuration(skills: TeamSkills): number {
  return BASE_PROJECT_MS + skills.timeSec * 1000;
}
