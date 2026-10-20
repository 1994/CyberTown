import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'artifacts/screenshots';
mkdirSync(SHOTS, { recursive: true });

interface Player {
  ctx: BrowserContext;
  page: Page;
  errors: string[];
}

/** 每个玩家使用独立 BrowserContext（独立 cookie/storage，相当于独立浏览器） */
async function openPlayer(browser: Browser, id: string, opts: { skipIntro?: boolean; viewport?: { width: number; height: number } } = {}): Promise<Player> {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto('/');
  await page.getByTestId(`identity-${id}`).click();
  await page.getByTestId('login-enter').click();
  await expect(page.getByTestId('my-coins')).toBeVisible();
  if (opts.skipIntro !== false) {
    await page.getByTestId('btn-skip-intro').click();
    const guideClose = page.getByTestId('guide-close');
    if (await guideClose.isVisible().catch(() => false)) await guideClose.click();
  }
  return { ctx, page, errors };
}

const coins = async (p: Page) => Number(await p.getByTestId('my-coins').getAttribute('data-value'));

/** 通过 UI 签约/挖角：等待服务端响应、确认框关闭、市场自动收起（交易完成的稳定状态） */
async function signFromMarket(p: Page, colleagueId: string) {
  if (!(await p.getByTestId('market').isVisible())) await p.getByTestId('btn-open-market').click();
  await p.getByTestId(`sign-${colleagueId}`).click();
  await expect(p.getByTestId('confirm-trade')).toBeVisible();
  const resp = p.waitForResponse((r) => r.url().includes(`/api/colleagues/${colleagueId}/sign`) && r.request().method() === 'POST');
  await p.getByTestId('confirm-trade-ok').click();
  expect((await resp).status()).toBe(200);
  await expect(p.getByTestId('confirm-trade')).toBeHidden();
  await expect(p.getByTestId('market')).toBeHidden();
}

/** 读取 3D 场景中某角色当前演出阶段（来自名牌 DOM 的 data-* 属性） */
const actor = (p: Page, id: string) => p.locator(`.nametag[data-actor="${id}"]`);

async function playProject(p: Page) {
  await p.getByTestId('btn-project').click();
  await p.getByTestId('btn-project-start').click();
  await expect(p.getByTestId('project-overlay')).toBeVisible();
  const deadline = Date.now() + 26_000;
  while (Date.now() < deadline) {
    if (await p.getByTestId('project-result').isVisible().catch(() => false)) break;
    const good = p.locator('.task:not(.trap)');
    const n = await good.count();
    for (let i = 0; i < n; i++) {
      await good
        .nth(0)
        .dispatchEvent('pointerdown')
        .catch(() => undefined);
      await p.waitForTimeout(110);
    }
    await p.waitForTimeout(60);
  }
  await expect(p.getByTestId('project-result')).toBeVisible({ timeout: 15_000 });
  const total = Number((await p.locator('.result-total b').innerText()).replace(/,/g, ''));
  return total;
}

// 失败时也关闭所有自建 context，避免泄漏 WebGL 页面拖慢后续用例
test.afterEach(async ({ browser }) => {
  for (const ctx of browser.contexts()) await ctx.close().catch(() => undefined);
});

test.beforeEach(async ({ request }) => {
  const r = await request.post('/api/demo/reset');
  expect(r.ok()).toBeTruthy();
});

test('F01 登录页：明确测试身份（非 SSO）、≥3 个身份、3D 办公室为主视觉', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('测试身份登录')).toBeVisible();
  await expect(page.getByText(/未接入真实 SSO/)).toBeVisible();
  expect(await page.locator('.identity').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/01-login.png` });
  expect(errors).toEqual([]);
  await ctx.close();
});

test('V05 入场电影镜头：自动播放、可跳过、可重播，HUD 不遮挡全屏', async ({ browser }) => {
  const a = await openPlayer(browser, 'wang', { skipIntro: false });
  await expect(a.page.getByTestId('intro-overlay')).toBeVisible();
  await a.page.waitForTimeout(2500);
  await a.page.screenshot({ path: `${SHOTS}/02-intro-cinematic.png` });
  // 片头自然结束（9 秒）后归位
  await expect(a.page.getByTestId('intro-overlay')).toBeHidden({ timeout: 12_000 });
  await a.page.getByTestId('guide-close').click();
  await a.page.screenshot({ path: `${SHOTS}/03-office-home.png` });
  // 重播 + 跳过
  await a.page.getByTestId('btn-replay-intro').click();
  await expect(a.page.getByTestId('intro-overlay')).toBeVisible();
  await a.page.getByTestId('btn-skip-intro').click();
  await expect(a.page.getByTestId('intro-overlay')).toBeHidden();
  expect(a.errors).toEqual([]);
  await a.ctx.close();
});

test('F05–F12 / V06–V07 双玩家独立 context：签约→挖角→赚钱→分身分红，实时同步与完整演出', async ({ browser }) => {
  test.setTimeout(240_000);
  const A = await openPlayer(browser, 'wang');
  const B = await openPlayer(browser, 'li');
  await expect.poll(() => coins(A.page)).toBe(600);
  await expect.poll(() => coins(B.page)).toBe(600);

  // ── A 初签张总 300：市场自动收起，电梯入场 → 走路 → 就座 → 技能激活 ──
  await signFromMarket(A.page, 'c-zhang');
  await expect(actor(A.page, 'c-zhang')).toHaveAttribute('data-mode', 'arrive');
  await expect(actor(A.page, 'c-zhang')).toHaveAttribute('data-phase', /elevator|walk/);
  await A.page.waitForTimeout(1200);
  await A.page.screenshot({ path: `${SHOTS}/04-arrive-elevator.png` });
  await expect(actor(A.page, 'c-zhang')).toHaveAttribute('data-phase', 'walk', { timeout: 5000 });
  await A.page.waitForTimeout(2500);
  await A.page.screenshot({ path: `${SHOTS}/05-arrive-walking.png` });
  await expect(actor(A.page, 'c-zhang')).toHaveAttribute('data-phase', /sit|celebrate/, { timeout: 15_000 });
  await expect(A.page.locator('.fx-label')).toContainText('技能激活');
  await A.page.waitForTimeout(400);
  await A.page.screenshot({ path: `${SHOTS}/06-arrive-seated-skill.png` });
  await expect(actor(A.page, 'c-zhang')).toHaveAttribute('data-phase', 'work', { timeout: 8000 });
  await expect.poll(() => coins(A.page)).toBe(300);
  await expect(A.page.getByTestId('team-slot-0')).toContainText('张总');

  // ── B 端 3 秒内同步：归属、价格、排行榜 ──
  const t0 = Date.now();
  await expect(B.page.getByTestId('mcard-c-zhang')).toContainText('老王', { timeout: 3000 });
  await expect(B.page.getByTestId('sign-c-zhang')).toHaveText('挖角', { timeout: 3000 });
  await expect(B.page.getByTestId('mcard-c-zhang')).toContainText('380');
  console.log(`B 同步耗时 ≤ ${Date.now() - t0}ms`);

  // ── B 挖角张总 380 → A：起身 → 收拾纸箱 → 走向电梯离场，空工位补偿 +342 ──
  await signFromMarket(B.page, 'c-zhang');
  const t1 = Date.now();
  await expect.poll(() => coins(A.page), { timeout: 3000 }).toBe(642);
  console.log(`A 金币同步耗时 ${Date.now() - t1}ms`);
  await expect.poll(() => coins(B.page)).toBe(220);
  await expect(A.page.locator('.toast.bad')).toContainText('被 小李 挖走');
  await expect(actor(A.page, 'c-zhang')).toHaveAttribute('data-mode', 'depart');
  await A.page.waitForTimeout(600);
  await A.page.screenshot({ path: `${SHOTS}/07-poached-shock.png` });
  await expect(actor(A.page, 'c-zhang')).toHaveAttribute('data-phase', 'd-pack', { timeout: 5000 });
  await A.page.waitForTimeout(1200);
  // 收拾期间工位仍被占用：补偿牌不得提前出现挡住人物/纸箱
  await expect(A.page.getByTestId('empty-desk-0')).toHaveCount(0);
  await A.page.screenshot({ path: `${SHOTS}/08-poached-packing-box.png` });
  await expect(actor(A.page, 'c-zhang')).toHaveAttribute('data-phase', 'd-walk', { timeout: 6000 });
  await A.page.waitForTimeout(2500);
  await A.page.screenshot({ path: `${SHOTS}/09-poached-walk-to-elevator.png` });
  await expect(A.page.getByTestId('empty-desk-0')).toContainText('补偿 +342');
  await expect(actor(A.page, 'c-zhang')).toHaveAttribute('data-phase', 'd-enter', { timeout: 15_000 });
  await A.page.screenshot({ path: `${SHOTS}/10-poached-into-elevator.png` });
  await expect(actor(A.page, 'c-zhang')).toHaveCount(0, { timeout: 8000 });
  await expect(A.page.getByTestId('team-slot-0')).toContainText('空工位');
  // B 端：张总入场
  await expect(actor(B.page, 'c-zhang')).toHaveAttribute('data-mode', 'arrive');
  await expect(actor(B.page, 'c-zhang')).toHaveAttribute('data-phase', 'work', { timeout: 25_000 });

  // ── B 接 15 秒紧急项目赚钱（带张总 +25%）──
  const before = await coins(B.page);
  await expect(B.page.getByTestId('btn-project')).toContainText('收益 +25%');
  const earned = await playProject(B.page);
  await B.page.screenshot({ path: `${SHOTS}/11-project-result.png` });
  expect(earned).toBeGreaterThanOrEqual(80);
  await expect.poll(() => coins(B.page)).toBe(before + earned);
  await B.page.getByTestId('btn-project-close').click();

  // ── B 签约老王(分身) 300 → A 收到 5% 分红 +15 ──
  await signFromMarket(B.page, 'c-wang');
  await expect.poll(() => coins(A.page), { timeout: 3000 }).toBe(657);
  await expect(A.page.locator('.toast.gold')).toContainText('分身分红 +15');
  await A.page.screenshot({ path: `${SHOTS}/12-dividend-toast.png` });

  // ── 消息中心、排行榜反映真实交易 ──
  await A.page.getByTestId('btn-messages').click();
  await expect(A.page.getByTestId('messages')).toContainText('张总 被挖走了');
  await expect(A.page.getByTestId('messages')).toContainText('分身分红 +15');
  await A.page.screenshot({ path: `${SHOTS}/13-messages.png` });
  await A.page.keyboard.press('Escape');
  await expect(A.page.getByTestId('board-wang')).toContainText('657');

  // ── 状态持久：刷新后仍是同一身份、同一余额 ──
  await A.page.reload();
  await expect(A.page.getByTestId('my-coins')).toHaveAttribute('data-value', '657');

  expect(A.errors, A.errors.join('\n')).toEqual([]);
  expect(B.errors, B.errors.join('\n')).toEqual([]);
  await A.ctx.close();
  await B.ctx.close();
});

test('F07 满员 / 余额不足 / 自己分身：按钮禁用并说明原因', async ({ browser }) => {
  const A = await openPlayer(browser, 'mei');
  await expect(A.page.getByTestId('sign-c-mei')).toHaveText('你的分身');
  await expect(A.page.getByTestId('sign-c-mei')).toBeDisabled();
  await signFromMarket(A.page, 'c-lily');
  await signFromMarket(A.page, 'c-qiang');
  await A.page.getByTestId('btn-open-market').click();
  await expect(A.page.getByTestId('sign-c-lily')).toHaveText('已在团队');
  await expect(A.page.getByTestId('sign-c-tony')).toHaveText('余额不足');
  await expect(A.page.getByTestId('sign-c-tony')).toBeDisabled();
  await A.page.screenshot({ path: `${SHOTS}/14-disabled-states.png` });
  expect(A.errors).toEqual([]);
  await A.ctx.close();
});

test('F11 两个浏览器同时抢同一同事：只有一个成功，另一个收到「手慢了」', async ({ browser }) => {
  const A = await openPlayer(browser, 'wang');
  const C = await openPlayer(browser, 'liu');
  for (const p of [A.page, C.page]) {
    await p.getByTestId('sign-c-tony').click();
    await expect(p.getByTestId('confirm-trade')).toBeVisible();
  }
  await Promise.all([A.page.getByTestId('confirm-trade-ok').click(), C.page.getByTestId('confirm-trade-ok').click()]);
  await A.page.waitForTimeout(1500);
  const errA = await A.page.getByTestId('trade-error').isVisible().catch(() => false);
  const errC = await C.page.getByTestId('trade-error').isVisible().catch(() => false);
  expect([errA, errC].filter(Boolean).length).toBe(1);
  const loser = errA ? A.page : C.page;
  await expect(loser.getByTestId('trade-error')).toContainText('手慢了');
  await loser.screenshot({ path: `${SHOTS}/15-concurrent-loser.png` });
  await expect.poll(async () => (await coins(A.page)) + (await coins(C.page))).toBe(900);
  await A.ctx.close();
  await C.ctx.close();
});

test('V08 移动端 390×844：可登录、HUD 可读、市场为底部抽屉、无横向溢出', async ({ browser }) => {
  const M = await openPlayer(browser, 'liu', { viewport: { width: 390, height: 844 } });
  await M.page.waitForTimeout(800);
  await M.page.screenshot({ path: `${SHOTS}/16-mobile-home.png` });
  const overflow = await M.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(M.page.getByTestId('btn-project')).toBeVisible();
  if (!(await M.page.getByTestId('market').isVisible())) await M.page.getByTestId('btn-open-market').click();
  await expect(M.page.getByTestId('market')).toBeVisible();
  await M.page.screenshot({ path: `${SHOTS}/17-mobile-market.png` });
  await signFromMarket(M.page, 'c-sakura');
  await expect(actor(M.page, 'c-sakura')).toHaveAttribute('data-phase', 'walk', { timeout: 6000 });
  await M.page.screenshot({ path: `${SHOTS}/18-mobile-arrival.png` });
  // 抽屉打开时，3D 场景中的 Html 名牌不得覆盖抽屉正文
  await M.page.getByTestId('btn-messages').click();
  await expect(M.page.getByTestId('messages')).toBeVisible();
  const covered = await M.page.evaluate(() => {
    const body = document.querySelector('[data-testid=messages]')!.getBoundingClientRect();
    const tags = [...document.querySelectorAll('.nametag, .empty-desk')];
    return tags.some((t) => {
      const r = t.getBoundingClientRect();
      if (r.width === 0 || r.right < body.left || r.left > body.right || r.bottom < body.top || r.top > body.bottom) return false;
      const el = document.elementFromPoint((Math.max(r.left, body.left) + Math.min(r.right, body.right)) / 2, (Math.max(r.top, body.top) + Math.min(r.bottom, body.bottom)) / 2);
      return !!el && (el.closest('.nametag') !== null || el.closest('.empty-desk') !== null);
    });
  });
  expect(covered).toBe(false);
  await M.page.waitForTimeout(600);
  await M.page.screenshot({ path: `${SHOTS}/19-mobile-messages-drawer.png` });
  expect(M.errors).toEqual([]);
  await M.ctx.close();
});
