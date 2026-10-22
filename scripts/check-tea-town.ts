// tea.3 救店任务真实 HTTP agent：只走 8898 独立档，不读库、不模拟本地结算。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { TeaLiveHome, TeaOpenSession, TeaSession, TeaStep, TeaWorkRole } from '../shared/teaLive.ts';
import type { TeaLedgerEntry } from '../shared/teaTown.ts';

const DEFAULT_BASE = 'http://127.0.0.1:8898';
const ARTIFACT = new URL('../artifacts/tea-town/agent.json', import.meta.url);
const rawBase = (process.env.TEA_BASE ?? DEFAULT_BASE).trim();
const OPEN_KEY = 'script-town-v1-rescue-official';
const HOLD = 20 * 6 + 120;

type Check = { name: string; ok: true };
type Report = {
  base: string;
  startedAt: string;
  finishedAt?: string;
  ok: boolean;
  checks: Check[];
  initial?: Record<string, unknown>;
  accepted?: Record<string, unknown>;
  opened?: Record<string, unknown>;
  session?: Record<string, unknown>;
  settlement?: Record<string, unknown>;
  lastStep?: Record<string, unknown>;
  upgrade?: Record<string, unknown>;
  readOnly?: Record<string, unknown>;
  error?: { check: string; code?: string; message: string };
};
type HttpFailure = Error & { status: number; code: string };
type Driven = { session: TeaSession; lastStep: { id: string; input: TeaStep } | null };

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

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === code;
}

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
      credentials: 'omit',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error(`无法连接 ${base}，请确认服务已启动`);
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

function homeSummary(home: TeaLiveHome) {
  return {
    coins: home.coins,
    level: home.shop.level,
    mission: home.mission,
    walletBalance: home.wallet.balance,
  };
}

function sessionSummary(session: TeaSession) {
  return {
    id: session.id,
    lesson: session.lesson,
    mode: session.run.mode,
    status: session.status,
    revision: session.revision,
    t: session.t,
    hold: session.hold,
    completed: session.run.result.completed,
    passed: session.run.result.passed,
    revenue: session.run.result.revenue,
    profit: session.run.result.profit,
    bonus: session.run.result.bonus,
    coinsAfter: session.run.coinsAfter,
    settledAt: session.run.settledAt,
    plan: session.run.plan,
  };
}

function entryOf(home: TeaLiveHome, kind: string, ref: string): TeaLedgerEntry | undefined {
  return home.wallet.entries.find((entry) => entry.kind === kind && entry.ref === ref);
}

function pickRole(session: TeaSession): TeaWorkRole | undefined {
  const task = session.frame.selfTask;
  if (task.role !== 'idle' || task.queuedRole !== null) return undefined;
  const cashier = session.frame.cashierQueue;
  const maker = session.frame.makerQueue;
  if (cashier + maker === 0) return undefined;
  return maker >= cashier ? 'maker' : 'cashier';
}

function failureInfo(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
  return { code, message };
}

async function main() {
  const parsed = new URL(rawBase);
  assert.ok(parsed.protocol === 'http:' || parsed.protocol === 'https:', 'TEA_BASE 必须是 http(s)');
  const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  assert.ok(loopback.has(parsed.hostname), 'TEA_BASE 仅允许 loopback');
  assert.ok(!['8787', '8897'].includes(parsed.port), '拒绝 8787/8897，使用独立 8898 试玩档');
  assert.ok(parsed.pathname === '/' || parsed.pathname === '', 'TEA_BASE 只接受源地址');
  const base = parsed.origin;
  report.base = base;

  const login = await request<{ token: string; playerId: string }>(
    base, null, 'POST', '/api/auth/test-login', { playerId: 'li' },
  );
  assert.equal(login.playerId, 'li');
  const token = login.token;
  const getHome = () => request<TeaLiveHome>(base, token, 'GET', '/api/tea/home');
  const acceptMission = () =>
    request<TeaLiveHome>(base, token, 'POST', '/api/tea/mission/accept', {});
  const open = (input: TeaOpenSession) =>
    request<TeaSession>(base, token, 'POST', '/api/tea/sessions', input);
  const get = (id: string) =>
    request<TeaSession>(base, token, 'GET', `/api/tea/sessions/${encodeURIComponent(id)}`);
  const step = (id: string, input: TeaStep) =>
    request<TeaSession>(base, token, 'POST', `/api/tea/sessions/${encodeURIComponent(id)}/step`, input);
  const upgrade = (expectedLevel: number) =>
    request<TeaLiveHome>(base, token, 'POST', '/api/tea/upgrade', { expectedLevel });

  async function drive(session: TeaSession): Promise<Driven> {
    let current = session;
    let lastStep: { id: string; input: TeaStep } | null = null;
    let guard = 0;
    while (current.status === 'active') {
      if (++guard > 500) throw new Error(`session ${current.id} 推进次数异常`);
      const role = pickRole(current);
      const input: TeaStep = {
        revision: current.revision,
        advance: 1,
        requestId: `tea-town-v1:${current.id}:${current.revision}:1:${role ?? 'none'}`,
      };
      if (role) input.assign = role;
      try {
        const next = await step(current.id, input);
        lastStep = { id: current.id, input };
        current = next;
      } catch (error) {
        if (isCode(error, 'TEA_REVISION')) {
          current = await get(current.id);
          continue;
        }
        if (isCode(error, 'TEA_FINISHED')) {
          current = await get(current.id);
          break;
        }
        throw error;
      }
    }
    return { session: current, lastStep };
  }

  function verifySettlement(home: TeaLiveHome, session: TeaSession, beforeOpen: TeaLiveHome | null) {
    const result = session.run.result;
    verify('救店有真实出杯并结算', () => {
      assert.equal(session.status, 'finished');
      assert.equal(session.lesson, 'rescue');
      assert.ok(result.completed > 0, '没有真实出杯');
      assert.ok(session.run.settledAt > 0);
    });
    verify('任务完成且 runId 对应', () => {
      assert.equal(home.mission.status, 'completed');
      assert.equal(home.mission.runId, session.id);
      assert.equal(home.mission.income, result.profit + result.bonus);
      assert.ok(home.mission.income > 0, '救店净收入应为正');
    });
    verify('钱包等于真实余额', () => {
      assert.equal(home.wallet.balance, home.coins);
      if (beforeOpen) assert.equal(home.coins, beforeOpen.coins + result.profit + result.bonus);
      else assert.equal(home.coins, session.run.coinsAfter);
    });
    verify('账本含 hold 与 sales', () => {
      const hold = entryOf(home, 'tea_hold', `tea:hold:${session.id}`);
      const sales = entryOf(home, 'tea_sales', `tea:${session.id}`);
      assert.ok(hold, '缺少预付 hold 账目');
      assert.ok(sales, '缺少销售 sales 账目');
      assert.equal(hold.delta, -session.hold);
      assert.equal(sales.delta, result.revenue + result.bonus);
    });
  }

  async function verifyFinished(home: TeaLiveHome) {
    const coins = home.coins;
    verify('已完成救店且 Lv2 保持', () => {
      assert.equal(home.mission.status, 'completed');
      assert.ok(home.shop.level >= 2);
      assert.equal(home.wallet.balance, home.coins);
    });
    assert.ok(home.mission.runId, '完成态缺少 runId');
    const session = await get(home.mission.runId);
    verify('历史救店可只读回放', () => {
      assert.equal(session.id, home.mission.runId);
      assert.equal(session.status, 'finished');
      assert.ok(session.run.result.completed > 0);
      const hold = entryOf(home, 'tea_hold', `tea:hold:${session.id}`);
      const sales = entryOf(home, 'tea_sales', `tea:${session.id}`);
      assert.ok(hold);
      assert.ok(sales);
    });
    const after = await getHome();
    verify('完成态只读不重复消费', () => {
      assert.equal(after.coins, coins);
      assert.equal(after.shop.level, home.shop.level);
    });
    report.readOnly = { home: homeSummary(home), session: sessionSummary(session), coins };
  }

  let home = await getHome();
  report.initial = homeSummary(home);
  if (home.mission.status === 'completed' && home.shop.level >= 2) {
    await verifyFinished(home);
    report.ok = true;
    return;
  }

  if (home.mission.status === 'offered') {
    const before = home;
    const first = await acceptMission();
    const second = await acceptMission();
    verify('acceptMission 空 body 幂等不加钱', () => {
      assert.notEqual(first.mission.status, 'offered');
      assert.equal(first.mission.acceptedAt, second.mission.acceptedAt);
      assert.equal(first.coins, before.coins);
      assert.equal(second.coins, before.coins);
      assert.equal(first.wallet.balance, before.wallet.balance);
      assert.equal(second.wallet.balance, before.wallet.balance);
    });
    report.accepted = {
      status: second.mission.status,
      acceptedAt: second.mission.acceptedAt,
      coinsBefore: before.coins,
      coinsAfter: second.coins,
    };
    home = second;
  }

  let session: TeaSession | null = null;
  let lastStep: { id: string; input: TeaStep } | null = null;
  let beforeOpen: TeaLiveHome | null = null;
  let openRetrySameId: boolean | null = null;

  if (home.mission.status === 'completed') {
    assert.ok(home.mission.runId, '完成态缺少 runId');
    session = await get(home.mission.runId);
  } else if (home.chapter.activeSessionId) {
    session = await get(home.chapter.activeSessionId);
    const driven = await drive(session);
    session = driven.session;
    lastStep = driven.lastStep;
  } else {
    beforeOpen = await getHome();
    assert.ok(beforeOpen.attemptsRemaining > 0, '今日正式额度已用完，禁止 reset');
    const input: TeaOpenSession = {
      plan: {
        assignments: [{ workerId: 'self', role: 'support' }],
        stock: 20,
        strategy: 'balanced',
      },
      lesson: 'rescue',
      mode: 'official',
      idempotencyKey: OPEN_KEY,
    };
    const first = await open(input);
    const afterOpen = await getHome();
    const retry = await open(input);
    const afterRetry = await getHome();
    openRetrySameId = first.id === retry.id;
    if (first.status === 'active') {
      verify('rescue 开门仅预付成本且幂等', () => {
        assert.equal(openRetrySameId, true);
        assert.equal(first.hold, HOLD);
        assert.equal(first.hold, first.run.result.totalCost);
        assert.equal(first.run.result.revenue, 0);
        assert.equal(first.run.result.completed, 0);
        assert.equal(first.run.settledAt, 0);
        assert.equal(afterOpen.coins, beforeOpen!.coins - first.hold);
        assert.equal(afterOpen.wallet.balance, afterOpen.coins);
        assert.equal(afterRetry.coins, afterOpen.coins);
        assert.equal(afterRetry.attemptsRemaining, afterOpen.attemptsRemaining);
      });
      report.opened = {
        id: first.id,
        hold: first.hold,
        coinsBefore: beforeOpen.coins,
        coinsAfterOpen: afterOpen.coins,
        openRetrySameId,
      };
    }
    const driven = first.status === 'active' ? await drive(first) : { session: first, lastStep: null };
    session = driven.session;
    lastStep = driven.lastStep;
  }

  assert.ok(session, '没有可核对的救店 session');
  const after = await getHome();
  verifySettlement(after, session, beforeOpen);

  if (lastStep) {
    const beforeReplay = after;
    const replayed = await step(lastStep.id, lastStep.input);
    const afterReplay = await getHome();
    verify('最后 step 同键不重复入账', () => {
      assert.equal(replayed.id, session!.id);
      assert.equal(replayed.revision, session!.revision);
      assert.equal(replayed.status, 'finished');
      assert.equal(afterReplay.coins, beforeReplay.coins);
      assert.equal(afterReplay.wallet.balance, beforeReplay.wallet.balance);
      assert.deepEqual(
        afterReplay.wallet.entries.map((entry) => entry.id),
        beforeReplay.wallet.entries.map((entry) => entry.id),
      );
    });
    report.lastStep = {
      requestId: lastStep.input.requestId,
      revision: replayed.revision,
      coinsBefore: beforeReplay.coins,
      coinsAfter: afterReplay.coins,
    };
  }

  const history = await get(session.id);
  verify('GET 回放与结算一致', () => {
    assert.deepEqual(history, session);
  });
  report.session = sessionSummary(session);
  report.settlement = {
    home: homeSummary(after),
    holdEntry: entryOf(after, 'tea_hold', `tea:hold:${session!.id}`),
    salesEntry: entryOf(after, 'tea_sales', `tea:${session!.id}`),
  };

  if (after.shop.level === 1) {
    const beforeUpgrade = await getHome();
    const lv2 = await upgrade(1);
    verify('救店后升级 Lv2 付 600', () => {
      assert.equal(lv2.shop.level, 2);
      assert.equal(lv2.coins, beforeUpgrade.coins - 600);
      assert.equal(lv2.wallet.balance, lv2.coins);
    });
    const retry = await upgrade(1);
    verify('同 expectedLevel 升级重试幂等', () => {
      assert.equal(retry.shop.level, 2);
      assert.equal(retry.coins, lv2.coins);
      assert.equal(retry.wallet.balance, lv2.wallet.balance);
    });
    const refreshed = await getHome();
    verify('升级刷新后保持', () => {
      assert.equal(refreshed.shop.level, 2);
      assert.equal(refreshed.coins, retry.coins);
      assert.equal(refreshed.wallet.balance, refreshed.coins);
    });
    report.upgrade = {
      levelBefore: beforeUpgrade.shop.level,
      coinsBefore: beforeUpgrade.coins,
      levelAfter: lv2.shop.level,
      coinsAfter: lv2.coins,
      retryCoins: retry.coins,
      refreshedLevel: refreshed.shop.level,
    };
  } else {
    verify('Lv2 已保持', () => assert.ok(after.shop.level >= 2));
    report.upgrade = { existingLevel: after.shop.level, coins: after.coins };
  }

  report.ok = true;
}

try {
  await main();
  console.log(JSON.stringify({
    ok: true,
    initial: report.initial,
    session: report.session,
    settlement: report.settlement ? {
      mission: (report.settlement.home as { mission?: unknown }).mission,
      walletBalance: (report.settlement.home as { walletBalance?: unknown }).walletBalance,
    } : null,
    upgrade: report.upgrade,
    artifact: 'artifacts/tea-town/agent.json',
  }));
} catch (error) {
  const failure = failureInfo(error);
  report.error = { check: activeCheck || 'startup', ...failure };
  console.error(JSON.stringify({ ok: false, error: report.error }));
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(new URL('.', ARTIFACT), { recursive: true });
  await writeFile(ARTIFACT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
