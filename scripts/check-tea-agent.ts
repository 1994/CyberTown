// 奶茶主线 API Agent 冒烟：真实请求 8897，结果写入 artifacts/tea-mainline/api-agent.json。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { TeaHome, TeaPlan, TeaRun, TeaWorker } from '../shared/tea.ts';

const DEFAULT_BASE = 'http://127.0.0.1:8897';
const KEY_SUFFIX = 'tea-agent-v1';
const ARTIFACT = new URL('../artifacts/tea-mainline/api-agent.json', import.meta.url);
const rawBase = (process.env.TEA_BASE ?? DEFAULT_BASE).trim();

type Check = { name: string; ok: true };
type Report = {
  base: string;
  startedAt: string;
  finishedAt?: string;
  ok: boolean;
  checks: Check[];
  practice?: Record<string, unknown>;
  officialHire?: Record<string, unknown>;
  officialDemos?: Record<string, unknown>;
  error?: { check: string; code?: string; message: string };
};

type HttpFailure = Error & { status: number; code: string };

async function request<T>(
  base: string,
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`无法连接 ${base}，请确认后端已在 8897 启动`);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* 允许空响应 */
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } })?.error;
    const failure = new Error(err?.message ?? `请求失败（${res.status}）`) as HttpFailure;
    failure.status = res.status;
    failure.code = err?.code ?? `HTTP_${res.status}`;
    throw failure;
  }
  return data as T;
}

const report: Report = {
  base: rawBase,
  startedAt: new Date().toISOString(),
  ok: false,
  checks: [],
};
let activeCheck = '';

function verify(name: string, fn: () => void) {
  activeCheck = name;
  fn();
  report.checks.push({ name, ok: true });
  activeCheck = '';
}

function worker(home: TeaHome, id: string): TeaWorker {
  const found = home.workers.find((w) => w.id === id);
  assert.ok(found, `缺少员工 ${id}`);
  return found;
}

function runSummary(run: TeaRun) {
  return {
    id: run.id,
    mode: run.mode,
    challengeId: run.challenge.id,
    seed: run.challenge.seed,
    plan: run.plan,
    workers: run.workers.map((w) => ({
      id: w.id,
      name: w.name,
      skill: w.skill,
      salary: w.salary,
      service: w.service,
      production: w.production,
    })),
    completed: run.result.completed,
    passed: run.result.passed,
    revenue: run.result.revenue,
    totalCost: run.result.totalCost,
    profit: run.result.profit,
    bonus: run.result.bonus,
    stockLeft: run.result.stockLeft,
    bottleneck: run.result.bottleneck,
    suggestion: run.result.suggestion,
    coinsAfter: run.coinsAfter,
  };
}

function shopSummary(home: TeaHome) {
  return { level: home.shop.level, coins: home.coins, nextUpgradeCost: home.shop.nextUpgradeCost };
}

async function main() {
  const parsed = new URL(rawBase);
  assert.ok(parsed.protocol === 'http:' || parsed.protocol === 'https:', 'TEA_BASE 必须是 http(s) 地址');
  assert.notEqual(parsed.port, '8787', '拒绝使用 8787：那是旧数据库端口，请用 8897');
  const base = parsed.href.replace(/\/+$/, '');
  report.base = base;

  const login = async (playerId: string) => {
    const r = await request<{ token: string; playerId: string }>(
      base, null, 'POST', '/api/auth/test-login', { playerId },
    );
    assert.equal(r.playerId, playerId, `登录身份不匹配：${playerId}`);
    return r.token;
  };
  const home = (token: string) => request<TeaHome>(base, token, 'GET', '/api/tea/home');
  const runTea = (token: string, plan: TeaPlan, mode: 'practice' | 'official', idempotencyKey: string) =>
    request<TeaRun>(base, token, 'POST', '/api/tea/runs', { plan, mode, idempotencyKey });

  const wangToken = await login('wang');
  const liToken = await login('li');
  const wangHome = await home(wangToken);
  const liHome = await home(liToken);
  report.base = base;

  verify('登录身份与同日挑战', () => {
    assert.equal(wangHome.playerId, 'wang');
    assert.equal(liHome.playerId, 'li');
    assert.equal(wangHome.challenge.id, liHome.challenge.id, '同日挑战应一致');
    assert.equal(wangHome.challenge.seed, liHome.challenge.seed);
  });

  const key = (label: string) => `wang-${label}-${wangHome.challenge.id}-${KEY_SUFFIX}`;
  const defaultPlan: TeaPlan = {
    assignments: [
      { workerId: 'self', role: 'support' },
      { workerId: 'system-a', role: 'cashier' },
      { workerId: 'system-b', role: 'maker' },
    ],
    stock: 80,
    strategy: 'balanced',
  };
  const complementaryPlan: TeaPlan = {
    assignments: [
      { workerId: 'self', role: 'support' },
      { workerId: 'demo-li', role: 'cashier' },
      { workerId: 'demo-wang', role: 'maker' },
    ],
    stock: 80,
    strategy: 'balanced',
  };
  verify('默认与互补阵容可用', () => {
    assert.ok(worker(wangHome, 'system-a').enabled);
    assert.ok(worker(wangHome, 'system-b').enabled);
    assert.ok(worker(wangHome, 'demo-li').enabled);
    assert.ok(worker(wangHome, 'demo-wang').enabled);
  });

  const beforePractice = await home(wangToken);
  const practiceDefault = await runTea(wangToken, defaultPlan, 'practice', key('practice-default'));
  const practiceComplementary = await runTea(
    wangToken, complementaryPlan, 'practice', key('practice-complementary'),
  );
  const afterPractice = await home(wangToken);
  verify('练习不改变经济与正式次数', () => {
    assert.equal(afterPractice.coins, beforePractice.coins, '练习后金币不应变化');
    assert.equal(afterPractice.shop.runs, beforePractice.shop.runs, '练习不应增加正式场次');
    assert.equal(afterPractice.shop.best, beforePractice.shop.best);
    assert.equal(afterPractice.attemptsRemaining, beforePractice.attemptsRemaining);
  });
  verify('互补阵完成数高于默认阵', () => {
    assert.ok(
      practiceComplementary.result.completed > practiceDefault.result.completed,
      `互补阵${practiceComplementary.result.completed}应高于默认阵${practiceDefault.result.completed}`,
    );
  });
  report.practice = {
    default: runSummary(practiceDefault),
    complementary: runSummary(practiceComplementary),
    completedDelta: practiceComplementary.result.completed - practiceDefault.result.completed,
    economy: {
      coinsBefore: beforePractice.coins,
      coinsAfter: afterPractice.coins,
      runsBefore: beforePractice.shop.runs,
      runsAfter: afterPractice.shop.runs,
      attemptsBefore: beforePractice.attemptsRemaining,
      attemptsAfter: afterPractice.attemptsRemaining,
    },
  };

  const hireSettings = await request<TeaHome>(
    base, liToken, 'PATCH', '/api/tea/hire-settings', { enabled: true },
  );
  const wangBeforeHire = await home(wangToken);
  verify('li 公开招聘后 wang 可见 employee:li', () => {
    assert.equal(hireSettings.hireEnabled, true);
    assert.equal(worker(wangBeforeHire, 'employee:li').enabled, true);
  });

  const hirePlan: TeaPlan = {
    assignments: [
      { workerId: 'self', role: 'support' },
      { workerId: 'employee:li', role: 'cashier' },
      { workerId: 'demo-chen', role: 'maker' },
    ],
    stock: 60,
    strategy: 'balanced',
  };
  const liBeforeHireRun = await home(liToken);
  const hireKey = key('official-hire');
  const officialHire = await runTea(wangToken, hirePlan, 'official', hireKey);
  const wangAfterHire = await home(wangToken);
  const officialHireRetry = await runTea(wangToken, hirePlan, 'official', hireKey);
  const wangAfterRetry = await home(wangToken);
  verify('同幂等键返回同一结果且余额不二次变化', () => {
    assert.equal(officialHireRetry.id, officialHire.id);
    assert.deepEqual(officialHireRetry.result, officialHire.result);
    assert.equal(wangAfterRetry.coins, wangAfterHire.coins, '重试不应再次扣款/结算');
  });

  const hiredLi = officialHire.workers.find((w) => w.id === 'employee:li');
  assert.ok(hiredLi, '正式局应包含 employee:li');
  const liAfterHireRun = await home(liToken);
  const wageDelta = liAfterHireRun.coins - liBeforeHireRun.coins;
  const consumedAttempt = wangBeforeHire.attemptsRemaining - wangAfterHire.attemptsRemaining;
  const settledNow = consumedAttempt === 1;
  const notice = liAfterHireRun.notices.find(
    (n) => n.employer === wangBeforeHire.name
      && n.worker === hiredLi.name
      && n.role === 'cashier'
      && n.salary === hiredLi.salary
      && n.completed === officialHire.result.completed,
  );
  verify('li 收到真实工资与合作 notice', () => {
    const expectedWageDelta = settledNow ? hiredLi.salary : 0;
    assert.equal(wageDelta, expectedWageDelta, `工资变化${wageDelta}，应为${expectedWageDelta}`);
    assert.ok(notice, '未找到 li 的真实用工 notice');
  });
  report.officialHire = {
    run: runSummary(officialHire),
    replaySameId: officialHireRetry.id === officialHire.id,
    wangCoinsBefore: wangBeforeHire.coins,
    wangCoinsAfter: wangAfterHire.coins,
    wangCoinsAfterRetry: wangAfterRetry.coins,
    li: {
      coinsBefore: liBeforeHireRun.coins,
      coinsAfter: liAfterHireRun.coins,
      wage: hiredLi.salary,
      wageDelta,
      settledNow,
      settlementNote: settledNow ? '本次实际到账' : '幂等重放，未二次支付；notice 为首次结算凭证',
      notice,
    },
  };

  const beforeDemos = await home(wangToken);
  const demosKey = key('official-demos');
  const officialDemos = await runTea(wangToken, complementaryPlan, 'official', demosKey);
  const fetched = await request<TeaRun>(
    base, wangToken, 'GET', `/api/tea/runs/${encodeURIComponent(officialDemos.id)}`,
  );
  verify('正式互补局可通过 getRun 本人读取', () => {
    assert.equal(fetched.id, officialDemos.id);
    assert.deepEqual(fetched.result, officialDemos.result);
    assert.equal(fetched.mode, 'official');
  });

  const beforeUpgrade = await home(wangToken);
  const levelBefore = beforeUpgrade.shop.level;
  const upgraded = await request<TeaHome>(
    base, wangToken, 'POST', '/api/tea/upgrade', { expectedLevel: 1 },
  );
  const refreshed = await home(wangToken);
  verify('升级扣除600或已升级时保持', () => {
    if (levelBefore === 1) {
      assert.equal(upgraded.shop.level, 2);
      assert.equal(upgraded.coins, beforeUpgrade.coins - 600);
      assert.equal(upgraded.shop.nextUpgradeCost, 1200);
    } else {
      assert.equal(upgraded.shop.level, levelBefore);
      assert.equal(upgraded.coins, beforeUpgrade.coins);
    }
  });
  verify('刷新后等级与余额保持', () => {
    assert.deepEqual(refreshed.shop, upgraded.shop);
    assert.equal(refreshed.coins, upgraded.coins);
  });
  report.officialDemos = {
    wangCoinsBefore: beforeDemos.coins,
    run: runSummary(officialDemos),
    getRun: { id: fetched.id, sameResult: fetched.result.completed === officialDemos.result.completed },
    beforeUpgrade: { ...shopSummary(beforeUpgrade), levelBefore },
    afterUpgrade: shopSummary(upgraded),
    refreshed: shopSummary(refreshed),
  };

  report.ok = true;
  console.log(JSON.stringify({
    ok: true,
    practice: {
      defaultCompleted: practiceDefault.result.completed,
      complementaryCompleted: practiceComplementary.result.completed,
    },
    hireRun: officialHire.id,
    demosRun: officialDemos.id,
    shop: shopSummary(refreshed),
  }));
}

function failureInfo(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
  const suffix = code === 'TEA_DAILY_LIMIT'
    ? '（今日正式额度已用完；禁止 reset，请次日重跑或人工核验）'
    : '';
  return { code, message: message + suffix };
}

try {
  await main();
} catch (error) {
  const failure = failureInfo(error);
  report.error = { check: activeCheck || 'startup', ...failure };
  console.error(JSON.stringify(report.error));
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(new URL('.', ARTIFACT), { recursive: true });
  await writeFile(ARTIFACT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
