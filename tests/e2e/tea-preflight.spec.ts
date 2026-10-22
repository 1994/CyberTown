import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { TeaSession, TeaLiveHome } from '../../shared/teaLive.ts';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset')).ok()).toBeTruthy();
});

const dir = 'artifacts/tea-preflight';
mkdirSync(dir, { recursive: true });

async function headers(page: Page) {
  return { authorization: `Bearer ${await page.evaluate(() => sessionStorage.getItem('boss.session'))}` };
}
async function home(page: Page): Promise<TeaLiveHome> {
  const res = await page.request.get('/api/tea/home', { headers: await headers(page) });
  expect(res.status()).toBe(200);
  return res.json();
}
async function current(page: Page, id: string): Promise<TeaSession> {
  const res = await page.request.get(`/api/tea/sessions/${id}`, { headers: await headers(page) });
  expect(res.status()).toBe(200);
  return res.json();
}
async function enter(page: Page, id: string) {
  await page.goto('/?lowfx=1');
  await page.getByTestId(`identity-${id}`).click();
  await page.getByTestId('enter-town').click();
  await expect(page.getByTestId('town-world')).toBeVisible();
}
async function phone(page: Page) {
  await page.getByTestId('town-world').getByRole('button', { name: '手机', exact: true }).click();
  await expect(page.getByTestId('town-phone')).toBeVisible();
}
async function ensureMission(page: Page) {
  await phone(page);
  const mission = page.getByTestId('town-mission');
  if (await mission.getAttribute('data-status') === 'offered') {
    await page.getByTestId('town-accept-mission').click();
    await expect(mission).toHaveAttribute('data-status', 'accepted');
  }
  await page.getByRole('button', { name: '收起手机', exact: true }).click();
}
async function dismissArrival(page: Page) {
  if (await page.getByTestId('town-arrival').count()) {
    await page.getByTestId('town-arrival-dismiss').click();
  }
}
async function recruitTwo(page: Page) {
  await phone(page);
  await page.getByTestId('town-go-recruit').click();
  await expect(page.getByTestId('town-recruit')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('town-recruit').click();
  await expect(page.getByRole('region', { name: '广场招募' })).toBeVisible();
  for (const name of ['老王', '小李']) {
    await page.locator('.tea-card').filter({ hasText: name }).locator('.tea-card-main').click();
  }
  await page.getByRole('button', { name: '好了，回地图', exact: true }).click();
}
async function walkShop(page: Page) {
  await phone(page);
  await page.getByTestId('town-go-shop').click();
  await expect(page.getByTestId('town-world')).toBeVisible();
  await expect(page.getByTestId('town-enter-shop')).toBeVisible({ timeout: 35_000 });
  await page.getByTestId('town-enter-shop').click();
  await expect(page.locator('.tea-prep')).toBeVisible();
}
async function confirmOpen(page: Page) {
  const dialog = page.getByTestId('tea-open-confirm');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByTestId('tea-confirm-start')).toBeVisible();
  return dialog;
}
async function startShift(page: Page, mode: 'official' | 'practice') {
  const response = page.waitForResponse((r) => r.url().endsWith('/api/tea/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: mode === 'official' ? /^正式开店/ : '免费试营业', exact: mode === 'practice' }).click();
  const dialog = await confirmOpen(page);
  await dialog.getByTestId('tea-confirm-start').click();
  const res = await response;
  expect(res.status()).toBe(200);
  return res.json() as Promise<TeaSession>;
}
async function selectStock(page: Page, stock: number) {
  const button = page.locator('.tea-prep').getByRole('button', { name: new RegExp(`^${stock}(?:\\s|$)`) });
  await expect(button).toBeVisible();
  await button.click();
}
async function finishUI(page: Page, id: string) {
  await page.getByRole('button', { name: /^跳过/ }).click();
  await expect(page.getByTestId('tea-report-dialog')).toBeVisible({ timeout: 30_000 });
  return current(page, id);
}
async function nextPrep(page: Page) {
  await page.getByTestId('tea-report-prep').click();
  await expect(page.locator('.tea-prep')).toBeVisible();
}
async function upgradeFromReport(page: Page, price: 600 | 1200) {
  const report = page.getByTestId('tea-report-dialog');
  const button = report.getByTestId('tea-report-upgrade');
  await expect(button).toBeVisible();
  await expect(button).toContainText(String(price));
  await expect(button).toBeEnabled();
  const response = page.waitForResponse((r) => r.url().endsWith('/api/tea/upgrade') && r.request().method() === 'POST');
  await button.click();
  expect((await response).status()).toBe(200);
  const prep = page.getByTestId('tea-report-prep');
  if (await prep.isVisible().catch(() => false)) await prep.click();
  else {
    const cont = page.getByRole('button', { name: /继续营业|回筹备/ }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click();
  }
  await expect(page.locator('.tea-prep')).toBeVisible();
}
async function upgradeWithLostReply(page: Page) {
  const before = await home(page);
  const report = page.getByTestId('tea-report-dialog');
  const button = report.getByTestId('tea-report-upgrade');
  await expect(button).toBeVisible();
  await expect(button).toContainText('600');
  let faults = 0;
  const pattern = '**/api/tea/upgrade';
  await page.route(pattern, async (route) => {
    if (route.request().method() === 'POST' && faults === 0) {
      faults++;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await button.click();
  await expect.poll(() => faults, { timeout: 10_000 }).toBe(1);
  const back = page.getByRole('button', { name: /回筹备/ }).first();
  await expect(back).toBeVisible({ timeout: 10_000 });
  await back.click();
  await expect(page.locator('.tea-prep')).toBeVisible();
  const after = await home(page);
  expect(after.shop.level).toBe(2);
  expect(after.coins).toBe(before.coins - 600);
  await page.unroute(pattern);
  return after;
}
async function snap(page: Page, name: string) {
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
}

test('三段真实经营：20/32/48 客、升级、次数耗尽与主线完成', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await enter(page, 'liu');
  await dismissArrival(page);
  await ensureMission(page);
  await recruitTwo(page);
  await walkShop(page);
  const start = await home(page);
  expect(start.business?.stage).toBe('rescue');
  expect(start.business?.challenge.arrivals).toBe(20);
  expect(start.business?.challenge.target).toBe(12);
  expect(start.business?.challenge.price).toBe(20);
  await selectStock(page, start.business!.recommendedStock);
  await snap(page, '01-lv1-prep');

  const lv1 = await startShift(page, 'official');
  const lv1End = await finishUI(page, lv1.id);
  expect(lv1End.run.result.completed).toBe(20);
  expect(lv1End.run.result.profit + lv1End.run.result.bonus).toBeGreaterThan(0);
  expect((await home(page)).business?.stage).toBe('renovate');
  await snap(page, '02-lv1-report');
  const lv2Home = await upgradeWithLostReply(page);
  expect(lv2Home.shop.level).toBe(2);
  expect(lv2Home.business?.challenge.shopLevel).toBe(2);
  expect(lv2Home.business?.challenge.arrivals).toBe(32);
  expect(lv2Home.business?.challenge.target).toBe(24);
  expect(lv2Home.business?.challenge.price).toBe(22);
  expect(lv2Home.business?.recommendedStock).toBe(40);
  await selectStock(page, lv2Home.business!.recommendedStock);
  await snap(page, '03-lv2-prep');

  const lv2 = await startShift(page, 'official');
  const lv2End = await finishUI(page, lv2.id);
  expect(lv2End.run.result.completed).toBe(32);
  expect(lv2End.run.result.profit + lv2End.run.result.bonus).toBeGreaterThan(0);
  expect((await home(page)).business?.stage).toBe('expand');
  await snap(page, '04-lv2-report');
  await upgradeFromReport(page, 1200);
  const lv3Home = await home(page);
  expect(lv3Home.shop.level).toBe(3);
  expect(lv3Home.business?.challenge.shopLevel).toBe(3);
  expect(lv3Home.business?.challenge.arrivals).toBe(48);
  expect(lv3Home.business?.challenge.target).toBe(36);
  expect(lv3Home.business?.challenge.price).toBe(24);
  expect(lv3Home.business?.recommendedStock).toBe(60);
  await selectStock(page, lv3Home.business!.recommendedStock);
  await snap(page, '05-lv3-prep');

  const lv3 = await startShift(page, 'official');
  const lv3End = await finishUI(page, lv3.id);
  expect(lv3End.run.result.completed).toBe(48);
  expect(lv3End.run.result.profit + lv3End.run.result.bonus).toBeGreaterThan(0);
  const done = await home(page);
  expect(done.business?.stage).toBe('complete');
  expect(done.attemptsRemaining).toBe(0);
  await snap(page, '06-lv3-report');
  await nextPrep(page);

  const officialButton = page.getByRole('button', { name: /^正式开店/ });
  await expect(officialButton).toBeDisabled();
  await expect(officialButton).toContainText('0');
  await expect(page.getByTestId('tea-official-blocked')).toContainText('今日正式次数已用完');
  const coins = (await home(page)).coins;
  const practice = await startShift(page, 'practice');
  expect(practice.run.mode).toBe('practice');
  expect(practice.hold).toBe(0);
  await page.getByRole('button', { name: /^跳过/ }).click();
  await expect(page.getByTestId('tea-report-dialog')).toBeVisible();
  expect((await home(page)).coins).toBe(coins);
  await nextPrep(page);
  await page.getByTestId('town-exit-shop').click();
  await expect(page.getByTestId('town-world')).toBeVisible();
  await phone(page);
  const goal = page.getByTestId('town-business-goal');
  await expect(goal).toHaveAttribute('data-stage', 'complete');
  await expect(goal).toContainText('主线已完成');
  await snap(page, '07-complete-phone');
  writeFileSync(`${dir}/three-shifts.json`, JSON.stringify({
    demo: 'liu', levels: [lv1.run.challenge.shopLevel, lv2.run.challenge.shopLevel, lv3.run.challenge.shopLevel],
    completed: [lv1End.run.result.completed, lv2End.run.result.completed, lv3End.run.result.completed],
    net: [lv1End.run.result.profit + lv1End.run.result.bonus, lv2End.run.result.profit + lv2End.run.result.bonus, lv3End.run.result.profit + lv3End.run.result.bonus],
    attempts: done.attemptsRemaining, stage: done.business?.stage, practiceHeld: practice.hold, errors,
  }, null, 2));
  expect(errors).toEqual([]);
});

test('网络故障回归：开门回包丢失、双击防重、step 两次失败后恢复', async ({ page }) => {
  test.setTimeout(120_000);
  await enter(page, 'mei');
  await dismissArrival(page);
  await ensureMission(page);
  await walkShop(page);
  const before = await home(page);
  expect(before.attemptsRemaining).toBeGreaterThan(0);

  let openFaults = 0;
  await page.route('**/api/tea/sessions', async (route) => {
    if (route.request().method() === 'POST' && openFaults === 0) {
      openFaults++;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: /^正式开店/ }).click();
  const lostDialog = await confirmOpen(page);
  await lostDialog.getByTestId('tea-confirm-start').click();
  await expect.poll(() => openFaults, { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(500);
  const lostHome = await home(page);
  expect(lostHome.chapter.activeSessionId).toBeTruthy();
  const activeId = lostHome.chapter.activeSessionId!;
  const lost = await current(page, activeId);
  expect(lost.status).toBe('active');
  expect(lostHome.coins).toBe(before.coins - lost.hold);
  expect(lostHome.attemptsRemaining).toBe(before.attemptsRemaining - 1);
  await snap(page, '08-lost-open');

  await page.reload();
  await expect(page.locator('.tea-dock')).toBeVisible();
  const recovered = await home(page);
  expect(recovered.chapter.activeSessionId).toBe(activeId);
  expect(recovered.coins).toBe(lostHome.coins);
  expect(recovered.attemptsRemaining).toBe(lostHome.attemptsRemaining);
  const recoveredSession = await current(page, activeId);
  expect(recoveredSession.status).toBe('active');
  await snap(page, '09-recovered');

  let stepFaults = 0;
  await page.route('**/api/tea/sessions/*/step', async (route) => {
    if (route.request().method() === 'POST' && stepFaults < 2) {
      stepFaults++;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect.poll(() => stepFaults, { timeout: 10_000 }).toBe(2);
  await page.waitForTimeout(500);
  const pausedCoins = (await home(page)).coins;
  const paused = await current(page, activeId);
  expect(pausedCoins).toBe(recovered.coins);
  expect(paused.id).toBe(activeId);
  expect(paused.status).toBe('active');
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeVisible();
  await page.unroute('**/api/tea/sessions/*/step');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^跳过/ }).click();
  await expect(page.getByTestId('tea-report-dialog')).toBeVisible({ timeout: 30_000 });
  const ended = await current(page, activeId);
  expect(ended.status).toBe('finished');
  const after = await home(page);
  expect(after.coins).toBe(before.coins + ended.run.result.profit + ended.run.result.bonus);
  const settled = after.coins;
  await page.reload();
  expect((await home(page)).coins).toBe(settled);
  await snap(page, '10-settled');

  // 双击最终确认：人为延迟 POST 500ms，两次同步 click 只能发出一个请求。
  if (await page.getByTestId('tea-report-dialog').count()) await nextPrep(page);
  await expect(page.locator('.tea-prep')).toBeVisible();
  await page.unroute('**/api/tea/sessions');
  let doublePosts = 0;
  await page.route('**/api/tea/sessions', async (route) => {
    if (route.request().method() === 'POST') {
      doublePosts++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.continue();
  });
  const doubleResponse = page.waitForResponse((r) => r.url().endsWith('/api/tea/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '免费试营业', exact: true }).click();
  const doubleDialog = await confirmOpen(page);
  const doubleStart = doubleDialog.getByTestId('tea-confirm-start');
  await Promise.all([doubleStart.dispatchEvent('click'), doubleStart.dispatchEvent('click')]);
  expect((await doubleResponse).status()).toBe(200);
  await page.waitForTimeout(600);
  expect(doublePosts).toBe(1);
  await expect(page.locator('.tea-dock')).toBeVisible();
  await page.getByRole('button', { name: /^跳过/ }).click();
  await expect(page.getByTestId('tea-report-dialog')).toBeVisible();

  writeFileSync(`${dir}/network.json`, JSON.stringify({
    demo: 'mei', session: activeId, openFaults, stepFaults, hold: lost.hold, doublePosts,
    coinsBefore: before.coins, coinsAfterSettle: settled, settledOnce: true,
  }, null, 2));
});
