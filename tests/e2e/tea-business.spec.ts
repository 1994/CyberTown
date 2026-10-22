import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { TeaSession, TeaLiveHome } from '../../shared/teaLive.ts';

const dir = 'artifacts/tea-business';
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
async function acceptMission(page: Page) {
  await phone(page);
  await expect(page.getByTestId('town-mission')).toHaveAttribute('data-status', 'offered');
  await page.getByTestId('town-accept-mission').click();
  await expect(page.getByTestId('town-mission')).toHaveAttribute('data-status', 'accepted');
  await page.getByRole('button', { name: '收起手机', exact: true }).click();
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
async function startOfficial(page: Page, screenshot?: string) {
  const response = page.waitForResponse((r) => r.url().endsWith('/api/tea/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^正式开店/ }).click();
  const dialog = await confirmOpen(page);
  await expect(dialog).toContainText(/预付|成本/);
  if (screenshot) await page.screenshot({ path: screenshot, animations: 'disabled' });
  await dialog.getByTestId('tea-confirm-start').click();
  const res = await response;
  expect(res.status()).toBe(200);
  return res.json() as Promise<TeaSession>;
}
async function startPractice(page: Page) {
  const response = page.waitForResponse((r) => r.url().endsWith('/api/tea/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '免费试营业', exact: true }).click();
  const dialog = await confirmOpen(page);
  await expect(dialog).toContainText(/免费|不扣|试营/);
  await dialog.getByTestId('tea-confirm-start').click();
  const res = await response;
  expect(res.status()).toBe(200);
  return res.json() as Promise<TeaSession>;
}
async function finishBySkip(page: Page) {
  await page.getByRole('button', { name: /^跳过/ }).click();
  await expect(page.getByTestId('tea-report-dialog')).toBeVisible({ timeout: 30_000 });
}
async function nextShift(page: Page) {
  await page.getByTestId('tea-report-prep').click();
  await expect(page.locator('.tea-prep')).toBeVisible();
}

test('经营强化：确认开班/真实报表/免费试营/升级业务挑战', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const sessions: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/tea/sessions')) sessions.push(request.url());
  });

  await enter(page, 'li');
  await expect(page.getByTestId('town-arrival')).toBeVisible();
  await page.getByTestId('town-arrival-dismiss').click();
  await acceptMission(page);
  await recruitTwo(page);
  await walkShop(page);
  const prepBefore = await home(page);
  await page.waitForTimeout(500);
  expect(sessions).toHaveLength(0);
  expect((await home(page)).coins).toBe(prepBefore.coins);
  await page.screenshot({ path: `${dir}/01-prep.png`, animations: 'disabled' });

  // 弹窗未确认前不建 session，取消不扣金币，也不允许改筹备计划。
  await page.getByRole('button', { name: /^正式开店/ }).click();
  const confirm = await confirmOpen(page);
  await confirm.getByRole('button', { name: /取消|再想想|关闭/ }).first().click();
  await expect(confirm).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(sessions).toHaveLength(0);
  expect((await home(page)).coins).toBe(prepBefore.coins);

  const official = await startOfficial(page, `${dir}/02-open-confirm.png`);
  expect(official.run.mode).toBe('official');
  expect(official.hold).toBeGreaterThan(0);
  expect(sessions).toHaveLength(1);
  expect((await home(page)).coins).toBe(prepBefore.coins - official.hold);

  // 这一班走 UI 自然时钟结束，验证报表自动弹出而不是 stub。
  await page.getByRole('button', { name: 'x2', exact: true }).click();
  const report = page.getByTestId('tea-report-dialog');
  await expect(report).toBeVisible({ timeout: 150_000 });
  await expect(report).toHaveAttribute('role', 'dialog');
  await expect(report).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.tea-report')).toBeVisible();
  const ended = await current(page, official.id);
  expect(ended.status).toBe('finished');
  const afterOfficial = await home(page);
  expect(afterOfficial.coins).toBe(prepBefore.coins + ended.run.result.profit + ended.run.result.bonus);
  for (const label of [/净收益|净赚/, /营收|营业收入/, '工资', '原料', '运营']) {
    await expect(page.locator('.tea-report')).toContainText(label);
  }
  await expect(report).toContainText(/下一目标|下一阶段/);
  await expect(report).toContainText(/预付|到账|钱包/);
  await page.screenshot({ path: `${dir}/03-report.png`, animations: 'disabled' });
  await nextShift(page);
  const afterNext = sessions.length;
  await page.waitForTimeout(400);
  expect(sessions).toHaveLength(afterNext);

  // 免费试营同样先确认，结束不增加钱包或经营进度。
  const freeBefore = await home(page);
  const progressBefore = freeBefore.business?.progress;
  const practice = await startPractice(page);
  expect(practice.run.mode).toBe('practice');
  expect(practice.hold).toBe(0);
  await finishBySkip(page);
  await expect(page.locator('.tea-report')).toContainText(/试营业|无结算/);
  await expect(page.locator('.tea-report')).not.toContainText('本次到账');
  const freeAfter = await home(page);
  expect(freeAfter.coins).toBe(freeBefore.coins);
  if (freeBefore.business && freeAfter.business) expect(freeAfter.business.progress).toBe(progressBefore);
  await nextShift(page);

  // Lv2：升级后由服务端冻结 32 客/24 杯/22 价/40 备货的挑战。
  const beforeUpgrade = await home(page);
  expect(beforeUpgrade.shop.level).toBe(1);
  expect(beforeUpgrade.business).toBeTruthy();
  expect(beforeUpgrade.business!.upgradeReady).toBe(true);
  const upgradeButton = page.locator('.tea-prep').getByRole('button', { name: /升级|焕新/ }).filter({ hasText: '600' }).first();
  await expect(upgradeButton).toBeVisible();
  await expect(upgradeButton).toBeEnabled();
  const upgradeResponse = page.waitForResponse((r) => r.url().endsWith('/api/tea/upgrade') && r.request().method() === 'POST');
  await upgradeButton.click();
  expect((await upgradeResponse).status()).toBe(200);
  const continueButton = page.getByRole('button', { name: /继续营业|回筹备/ }).first();
  if (await continueButton.count()) await continueButton.click();
  await expect(page.locator('.tea-prep')).toBeVisible();
  const levelTwo = await home(page);
  expect(levelTwo.shop.level).toBe(2);
  expect(levelTwo.business).toBeTruthy();
  expect(levelTwo.business!.challenge.shopLevel).toBe(2);
  expect(levelTwo.business!.challenge.arrivals).toBe(32);
  expect(levelTwo.business!.challenge.target).toBe(24);
  expect(levelTwo.business!.challenge.price).toBe(22);
  expect(levelTwo.business!.stockOptions).toContain(40);
  expect(levelTwo.business!.recommendedStock).toBe(40);
  const stock40 = page.locator('.tea-prep').getByRole('button', { name: /^40(?:\s|$)/ });
  await expect(stock40).toBeVisible();
  await stock40.click();
  const levelTwoRun = await startOfficial(page);
  expect(levelTwoRun.run.plan.stock).toBe(40);
  expect(levelTwoRun.run.challenge.shopLevel).toBe(2);
  expect(levelTwoRun.run.challenge.arrivals).toBe(32);
  expect(levelTwoRun.run.challenge.target).toBe(24);
  expect(levelTwoRun.run.challenge.price).toBe(22);
  await finishBySkip(page);
  await expect(page.getByTestId('tea-report-dialog')).toBeVisible();
  const lv2 = { level: 2, arrivals: 32, target: 24, price: 22, stock: 40 };
  await nextShift(page);

  // 历史报告只读回放，不得再次入账。
  const historyCoins = (await home(page)).coins;
  await page.getByRole('button', { name: /历史/ }).click();
  const historyRun = page.locator('.tea-hist').first();
  await expect(historyRun).toBeVisible();
  await historyRun.click();
  await expect(page.getByTestId('tea-report-dialog')).toBeVisible();
  await page.waitForTimeout(500);
  expect((await home(page)).coins).toBe(historyCoins);

  await page.screenshot({ path: `${dir}/04-final.png`, animations: 'disabled' });
  writeFileSync(`${dir}/business.json`, JSON.stringify({
    demo: 'li',
    prepNoPost: true,
    confirmCancelNoCharge: true,
    official: { id: official.id, hold: official.hold, completed: ended.run.result.completed, net: ended.run.result.profit + ended.run.result.bonus },
    reportAuto: true,
    nextNoPost: true,
    practice: { id: practice.id, hold: practice.hold, coinsUnchanged: true, progressUnchanged: true },
    lv2,
    historyReadOnly: true,
    errors,
  }, null, 2));
  expect(errors).toEqual([]);
});
