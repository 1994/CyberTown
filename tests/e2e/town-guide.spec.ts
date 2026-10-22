import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = 'artifacts/town-guide';
mkdirSync(dir, { recursive: true });

test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset')).ok()).toBeTruthy();
});

async function home(page: Page) {
  const res = await page.request.get('/api/tea/home', {
    headers: { authorization: `Bearer ${await page.evaluate(() => sessionStorage.getItem('boss.session'))}` },
  });
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
  await page.getByTestId('town-phone-trigger').click();
  await expect(page.getByTestId('town-phone')).toBeVisible();
}
async function closePhone(page: Page) {
  await page.getByRole('button', { name: '收起手机', exact: true }).click();
  await expect(page.getByTestId('town-phone')).toHaveCount(0);
}
async function inViewport(locator: ReturnType<Page['locator']>, page: Page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}
async function v2Key(page: Page, id: string) {
  return page.evaluate((player) => Object.keys(localStorage)
    .filter((key) => key.includes('town-arrival:v2') && key.endsWith(`:${player}`)), id);
}
async function touchGuide(browser: Browser, baseURL: string, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ baseURL, viewport, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('boss.session.town-arrival:mei', '1'); } catch { /* 仅旧档种子 */ }
  });
  const page = await ctx.newPage();
  await enter(page, 'mei');
  return { ctx, page };
}

test('桌面首次入镇：真实手机任务、帮助重开与刷新持久化', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, 'wang');
  const arrival = page.getByTestId('town-arrival');
  await expect(arrival).toBeVisible();
  await expect(arrival).toContainText('WASD');
  await expect(arrival).toContainText('右上角');
  await expect(arrival).toContainText('手机');
  await expect(arrival).toContainText('P');
  await expect(arrival).toContainText('任务');
  await expect(arrival).toContainText('钱包');
  await expect(arrival).not.toContainText('倒闭');
  await expect(arrival.getByRole('button', { name: '先逛逛', exact: true })).toBeVisible();
  const trigger = page.getByTestId('town-phone-trigger');
  await expect(trigger).toHaveAttribute('data-guided', 'true');
  const before = await home(page);
  await page.screenshot({ path: `${dir}/01-desktop-guide.png`, animations: 'disabled' });

  await arrival.getByRole('button', { name: '查看手机消息', exact: true }).click();
  await expect(page.getByTestId('town-phone')).toBeVisible();
  await expect(page.getByTestId('town-mission')).toHaveAttribute('data-status', 'offered');
  const afterPhone = await home(page);
  expect(afterPhone.coins).toBe(before.coins);
  expect(afterPhone.mission.status).toBe('offered');
  await page.screenshot({ path: `${dir}/02-phone-mission.png`, animations: 'disabled' });
  await closePhone(page);

  if (await arrival.isVisible().catch(() => false)) {
    await arrival.getByRole('button', { name: '先逛逛', exact: true }).click();
    await expect(arrival).toHaveCount(0);
  }
  const help = page.getByTestId('town-guide-help');
  await expect(help).toBeVisible();
  await expect(help).toHaveAccessibleName('操作指引');
  await help.click();
  await expect(arrival).toBeVisible();
  await page.getByTestId('town-arrival-dismiss').click();
  await expect(arrival).toHaveCount(0);
  expect(await v2Key(page, 'wang')).not.toHaveLength(0);

  await page.reload();
  await expect(page.getByTestId('town-world')).toBeVisible();
  await expect(page.getByTestId('town-arrival')).toHaveCount(0);
  await phone(page);
  await expect(page.getByTestId('town-phone')).toBeVisible();
  await closePhone(page);
  await page.keyboard.press('KeyP');
  await expect(page.getByTestId('town-phone')).toBeVisible();
  await closePhone(page);
  expect(errors).toEqual([]);
});

test('触屏竖屏/横屏：旧 v1 与已接任务仍首次显示 v2，且无 WASD/P', async ({ browser, request }) => {
  const baseURL = test.info().project.use.baseURL ?? 'http://127.0.0.1:8899';
  const login = await request.post('/api/auth/test-login', { data: { playerId: 'mei' } });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json() as { token: string }).token;
  const accepted = await request.post('/api/tea/mission/accept', {
    headers: { authorization: `Bearer ${token}` },
    data: {},
  });
  expect(accepted.ok(), await accepted.text()).toBeTruthy();

  const portrait = await touchGuide(browser, baseURL, { width: 390, height: 844 });
  const p = portrait.page;
  const arrival = p.getByTestId('town-arrival');
  await expect(arrival).toBeVisible();
  await expect(arrival).not.toContainText('WASD');
  await expect(arrival).not.toContainText(/按 ?P/);
  await expect(arrival).toContainText(/摇杆|点地面/);
  const before = await home(p);
  expect(before.mission.status).toBe('accepted');
  expect(await p.evaluate(() => localStorage.getItem('boss.session.town-arrival:mei'))).toBe('1');
  await inViewport(p.getByTestId('town-guide-help'), p);
  await p.screenshot({ path: `${dir}/03-touch-portrait.png`, animations: 'disabled' });
  await p.getByTestId('town-arrival-dismiss').click();
  expect(await v2Key(p, 'mei')).not.toHaveLength(0);
  await p.getByTestId('town-guide-help').click();
  await expect(arrival).toBeVisible();
  await inViewport(p.getByTestId('town-guide-help'), p);
  await p.getByTestId('town-arrival-dismiss').click();
  await p.reload();
  await expect(p.getByTestId('town-world')).toBeVisible();
  await expect(p.getByTestId('town-arrival')).toHaveCount(0);
  const after = await home(p);
  expect(after.coins).toBe(before.coins);
  await portrait.ctx.close();

  const landscape = await touchGuide(browser, baseURL, { width: 844, height: 390 });
  const l = landscape.page;
  const lArrival = l.getByTestId('town-arrival');
  await expect(lArrival).toBeVisible();
  await expect(lArrival).not.toContainText('WASD');
  await expect(lArrival).not.toContainText(/按 ?P/);
  await inViewport(l.getByTestId('town-guide-help'), l);
  await inViewport(l.getByTestId('town-phone-trigger'), l);
  await l.screenshot({ path: `${dir}/04-touch-landscape.png`, animations: 'disabled' });
  await l.getByTestId('town-arrival-dismiss').click();
  await expect(lArrival).toHaveCount(0);
  await landscape.ctx.close();

  writeFileSync(`${dir}/guide.json`, JSON.stringify({
    demo: true, desktop: { wasd: true, guideHelp: true, noMissionAutoAccept: true, persisted: true },
    touch: { portrait: true, landscape: true, oldV1KeySeeded: true, acceptedMissionStillGuided: true, pcHintsHidden: true },
  }, null, 2));
});
