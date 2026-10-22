// 真实 tea.2 章节 API agent：只走 HTTP，不读写 SQLite；服务未启动时不会执行。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { TeaPlan } from '../shared/tea.ts';
import type {
  TeaChapterStage,
  TeaLiveHome,
  TeaOpenSession,
  TeaSession,
  TeaStep,
  TeaWorkRole,
} from '../shared/teaLive.ts';

const DEFAULT_BASE = 'http://127.0.0.1:8896';
const ARTIFACT = new URL('../artifacts/tea-chapter/agent-live.json', import.meta.url);
const rawBase = (process.env.TEA_BASE ?? DEFAULT_BASE).trim();

type Check = { name: string; ok: true };
type Report = {
  base: string;
  startedAt: string;
  finishedAt?: string;
  ok: boolean;
  checks: Check[];
  chapterBefore?: { stage: TeaChapterStage; level: number; coins: number };
  resumed?: Record<string, unknown>;
  solo?: Record<string, unknown>;
  duo?: Record<string, unknown>;
  official?: Record<string, unknown>;
  upgrade?: Record<string, unknown>;
  completed?: Record<string, unknown>;
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

function chapterSummary(home: TeaLiveHome) {
  return { stage: home.chapter.stage, level: home.shop.level, coins: home.coins };
}

function sessionSummary(session: TeaSession) {
  return {
    id: session.id,
    lesson: session.lesson,
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
  };
}

function requestId(session: TeaSession, role: TeaWorkRole | undefined): string {
  return `tea-live-v1:${session.id}:${session.revision}:1:${role ?? 'none'}`;
}

function pickRole(session: TeaSession, minQueue: number): TeaWorkRole | undefined {
  const task = session.frame.selfTask;
  if (task.role !== 'idle' || task.queuedRole !== null) return undefined;
  const cashier = session.frame.cashierQueue;
  const maker = session.frame.makerQueue;
  if (cashier + maker === 0) return undefined;
  if (Math.max(cashier, maker) < minQueue) return undefined;
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
  assert.ok(!['8787', '8897'].includes(parsed.port), '拒绝 8787/8897，使用独立试玩档 8896');
  assert.ok(parsed.pathname === '/' || parsed.pathname === '', 'TEA_BASE 只接受源地址');
  const base = parsed.origin;
  report.base = base;

  const login = await request<{ token: string; playerId: string }>(
    base, null, 'POST', '/api/auth/test-login', { playerId: 'li' },
  );
  assert.equal(login.playerId, 'li');
  const token = login.token;
  const getHome = () => request<TeaLiveHome>(base, token, 'GET', '/api/tea/home');
  const open = (input: TeaOpenSession) =>
    request<TeaSession>(base, token, 'POST', '/api/tea/sessions', input);
  const get = (id: string) =>
    request<TeaSession>(base, token, 'GET', `/api/tea/sessions/${encodeURIComponent(id)}`);
  const step = (id: string, input: TeaStep) =>
    request<TeaSession>(base, token, 'POST', `/api/tea/sessions/${encodeURIComponent(id)}/step`, input);
  const upgrade = (expectedLevel: number) =>
    request<TeaLiveHome>(base, token, 'POST', '/api/tea/upgrade', { expectedLevel });

  async function drive(session: TeaSession, minQueue: number): Promise<Driven> {
    let current = session;
    let lastStep: { id: string; input: TeaStep } | null = null;
    let guard = 0;
    while (current.status === 'active') {
      if (++guard > 400) throw new Error(`session ${current.id} 推进次数异常`);
      const role = pickRole(current, minQueue);
      const input: TeaStep = {
        revision: current.revision,
        advance: 1,
        requestId: requestId(current, role),
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

  async function verifyCompleted(home: TeaLiveHome) {
    const coins = home.coins;
    verify('主线 Lv3 已完成', () => {
      assert.equal(home.chapter.stage, 'complete');
      assert.equal(home.shop.level, 3);
    });
    const passed = home.recentRuns.find((run) => run.mode === 'official' && run.result.passed);
    assert.ok(passed, '已完成档案缺少正式通过记录');
    const session = await get(passed.id);
    verify('历史正式局可只读回放', () => {
      assert.equal(session.id, passed.id);
      assert.equal(session.status, 'finished');
      assert.equal(session.run.result.passed, true);
    });
    const after = await getHome();
    verify('完成态只读不再花钱', () => {
      assert.equal(after.coins, coins);
      assert.equal(after.shop.level, 3);
    });
    report.completed = {
      chapter: chapterSummary(home),
      session: sessionSummary(session),
      coinsBefore: coins,
      coinsAfter: after.coins,
    };
  }

  let home = await getHome();
  report.chapterBefore = chapterSummary(home);
  if (home.chapter.stage === 'complete' && home.shop.level >= 3) {
    await verifyCompleted(home);
    report.ok = true;
    return;
  }

  if (home.chapter.activeSessionId) {
    const active = await get(home.chapter.activeSessionId);
    const driven = await drive(active, active.lesson === 'rush' ? 4 : 0);
    report.resumed = {
      ...sessionSummary(driven.session),
      requestedFrom: home.chapter.activeSessionId,
    };
    home = await getHome();
  }

  const practicePlan = (workerId?: string): TeaPlan => ({
    assignments: [
      { workerId: 'self', role: 'support' },
      ...(workerId ? [{ workerId, role: 'maker' as const }] : []),
    ],
    stock: 60,
    strategy: 'balanced',
  });

  async function runPractice(lesson: 'solo' | 'duo') {
    const before = await getHome();
    assert.equal(before.chapter.stage, lesson, `${lesson} 章节状态不符`);
    const input: TeaOpenSession = {
      plan: practicePlan(lesson === 'duo' ? 'demo-wang' : undefined),
      lesson,
      mode: 'practice',
      idempotencyKey: `script-live-v1-${lesson}-practice`,
    };
    const first = await open(input);
    const afterFirst = await getHome();
    const retry = await open(input);
    const afterRetry = await getHome();
    verify(`${lesson} 免费开门幂等`, () => {
      assert.equal(first.id, retry.id);
      assert.equal(first.hold, 0);
      assert.equal(afterFirst.coins, before.coins);
      assert.equal(afterRetry.coins, before.coins);
      assert.equal(afterRetry.attemptsRemaining, before.attemptsRemaining);
    });
    const driven = first.status === 'active' ? await drive(first, 0) : { session: first, lastStep: null };
    const after = await getHome();
    verify(`${lesson} 练习零经济且真实出杯`, () => {
      assert.equal(after.coins, before.coins);
      assert.equal(after.attemptsRemaining, before.attemptsRemaining);
      assert.equal(after.shop.runs, before.shop.runs);
      assert.ok(driven.session.run.result.completed > 0, `${lesson} 未完成出杯`);
    });
    const expected = lesson === 'solo' ? 'duo' : 'rush';
    verify(`${lesson} 推进到 ${expected}`, () => {
      assert.equal(after.chapter.stage, expected);
    });
    report[lesson] = {
      ...sessionSummary(driven.session),
      chapterAfter: after.chapter.stage,
      coinsBefore: before.coins,
      coinsAfter: after.coins,
      attemptsBefore: before.attemptsRemaining,
      attemptsAfter: after.attemptsRemaining,
      openRetrySameId: first.id === retry.id,
    };
  }

  if (home.chapter.stage === 'solo') {
    await runPractice('solo');
    home = await getHome();
  }
  if (home.chapter.stage === 'duo') {
    await runPractice('duo');
    home = await getHome();
  }

  if (home.chapter.stage === 'rush') {
    const before = await getHome();
    assert.ok(before.attemptsRemaining > 0, '今日正式额度已用完，禁止 reset');
    const input: TeaOpenSession = {
      plan: {
        assignments: [
          { workerId: 'self', role: 'support' },
          { workerId: 'demo-wang', role: 'maker' },
          { workerId: 'demo-li', role: 'cashier' },
        ],
        stock: 80,
        strategy: 'balanced',
      },
      lesson: 'rush',
      mode: 'official',
      idempotencyKey: 'script-live-v1-rush-official',
    };
    const first = await open(input);
    const afterOpen = await getHome();
    const retry = await open(input);
    const afterRetry = await getHome();
    verify('正式开门只预付且幂等', () => {
      assert.equal(first.id, retry.id);
      assert.ok(first.hold > 0);
      assert.equal(first.hold, first.run.result.totalCost);
      assert.equal(first.run.result.revenue, 0);
      assert.equal(first.run.result.completed, 0);
      assert.equal(first.run.settledAt, 0);
      assert.equal(first.t, 0);
      assert.equal(afterOpen.coins, before.coins - first.hold);
      assert.equal(afterRetry.coins, afterOpen.coins);
      assert.equal(afterRetry.attemptsRemaining, afterOpen.attemptsRemaining);
    });

    const driven = first.status === 'active' ? await drive(first, 4) : { session: first, lastStep: null };
    const final = driven.session;
    const after = await getHome();
    verify('正式达标并真实结算', () => {
      assert.equal(final.status, 'finished');
      assert.equal(final.run.result.passed, true);
      assert.ok(final.run.result.completed >= final.run.challenge.target);
      assert.ok(final.run.settledAt > 0);
    });
    verify('最终币数=开门前+profit+bonus', () => {
      assert.equal(after.coins, before.coins + final.run.result.profit + final.run.result.bonus);
    });
    verify('章节进入升级段', () => {
      const expected = after.shop.level >= 2 ? 'complete' : 'upgrade';
      assert.equal(after.chapter.stage, expected);
    });

    let lastStepReplay: Record<string, unknown> | null = null;
    if (driven.lastStep) {
      const replayCoins = after.coins;
      const replayed = await step(driven.lastStep.id, driven.lastStep.input);
      const afterReplay = await getHome();
      verify('最后 step 重试不重复结算', () => {
        assert.equal(replayed.id, final.id);
        assert.equal(replayed.revision, final.revision);
        assert.equal(replayed.status, 'finished');
        assert.equal(afterReplay.coins, replayCoins);
      });
      lastStepReplay = {
        requestId: driven.lastStep.input.requestId,
        revision: replayed.revision,
        coinsBefore: replayCoins,
        coinsAfter: afterReplay.coins,
      };
    }

    const history = await get(final.id);
    verify('GET 回放与结算一致', () => {
      assert.deepEqual(history, final);
    });
    report.official = {
      ...sessionSummary(final),
      target: final.run.challenge.target,
      beforeCoins: before.coins,
      coinsAfterOpen: afterOpen.coins,
      coinsAfter: after.coins,
      openRetrySameId: first.id === retry.id,
      lastStepReplay,
      historySame: true,
      plan: final.run.plan,
    };
    home = after;
  }

  if (home.chapter.stage === 'upgrade' || (home.chapter.stage === 'complete' && home.shop.level < 3)) {
    let current = await getHome();
    const levelBefore = current.shop.level;
    const coinsBefore = current.coins;
    let lv2: TeaLiveHome | null = null;
    let lv3: TeaLiveHome | null = null;
    if (current.shop.level === 1) {
      const coins = current.coins;
      lv2 = await upgrade(1);
      verify('升级 Lv2 完成首章', () => {
        assert.equal(lv2?.shop.level, 2);
        assert.equal(lv2?.coins, coins - 600);
        assert.equal(lv2?.chapter.stage, 'complete');
      });
      current = lv2;
    } else {
      lv2 = current;
    }
    if (current.shop.level === 2) {
      const coins = current.coins;
      lv3 = await upgrade(2);
      verify('升级 Lv3 完成主线', () => {
        assert.equal(lv3?.shop.level, 3);
        assert.equal(lv3?.coins, coins - 1200);
        assert.equal(lv3?.chapter.stage, 'complete');
      });
      current = lv3;
    } else {
      lv3 = current;
    }
    const refreshed = await getHome();
    verify('升级后刷新保持 Lv3', () => {
      assert.equal(refreshed.shop.level, 3);
      assert.equal(refreshed.chapter.stage, 'complete');
      assert.equal(refreshed.coins, current.coins);
    });
    report.upgrade = {
      levelBefore,
      coinsBefore,
      lv2: lv2 ? chapterSummary(lv2) : null,
      lv3: lv3 ? chapterSummary(lv3) : null,
      refreshed: chapterSummary(refreshed),
    };
    home = refreshed;
  }

  if (!(home.chapter.stage === 'complete' && home.shop.level >= 3)) {
    const lastStage = home.chapter.stage;
    assert.fail(`章节尚未完成：stage=${lastStage}, level=${home.shop.level}`);
  }
  await verifyCompleted(home);
  report.ok = true;
}

try {
  await main();
  console.log(JSON.stringify({
    ok: true,
    chapter: report.chapterBefore,
    solo: report.solo?.completed,
    duo: report.duo?.completed,
    official: report.official
      ? { passed: report.official.passed, completed: report.official.completed, profit: report.official.profit }
      : null,
    upgrade: report.upgrade,
    artifact: 'artifacts/tea-chapter/agent-live.json',
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
