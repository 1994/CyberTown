import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { TOWN_OPPORTUNITIES } from '../../shared/townExplore.ts';

const dir = 'artifacts/town-expansion';
mkdirSync(dir, { recursive: true });
async function home(page: Page) {
  const res = await page.request.get('/api/tea/home', { headers: await auth(page) });
  expect(res.status()).toBe(200);
  return res.json();
}
async function auth(page: Page) {
  return { authorization: `Bearer ${await page.evaluate(() => sessionStorage.getItem('boss.session'))}` };
}
async function enter(page: Page) {
  await page.goto('/?lowfx=1');
  await page.getByTestId('identity-wang').click();
  await page.getByTestId('enter-town').click();
  await expect(page.getByTestId('town-world')).toBeVisible();
  await page.getByTestId('town-arrival-dismiss').click();
}
test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset')).ok()).toBeTruthy();
});

test('大地图四处真实步行考察、一次奖励、存档与首店成长条件', async ({ page }) => {
  test.setTimeout(260_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await enter(page);
  const before = await home(page);
  expect(before.exploration.visited).toBe(0);
  const far = await page.request.post('/api/tea/explore', {
    headers: await auth(page), data: { siteId: 'west-market' },
  });
  expect(far.status()).toBe(409);
  const captures = [];
  for (const [index, site] of TOWN_OPPORTUNITIES.entries()) {
    await page.getByRole('button', { name: '小地图', exact: true }).click();
    const target = page.getByTestId(`town-map-destination-${site.id}`);
    await target.scrollIntoViewIfNeeded();
    await target.click();
    const survey = page.getByTestId('town-survey').filter({ has: page.getByRole('button', { name: /考察/ }) });
    await expect(page.getByTestId('town-survey')).toHaveAttribute('data-site', site.id, { timeout: 65_000 });
    await survey.getByRole('button', { name: /考察/ }).click();
    await expect.poll(async () => (await home(page)).exploration.visited).toBe(index + 1);
    const h = await home(page);
    expect(h.coins).toBe(before.coins + 30 * (index + 1));
    expect(h.mission.status).toBe(before.mission.status);
    expect(h.exploration.chainReady).toBe(false);
    expect(h.exploration.opportunities.find((s: { id: string }) => s.id === site.id).visitedAt).toBeGreaterThan(0);
    const repeat = await page.request.post('/api/tea/explore', { headers: await auth(page), data: { siteId: site.id } });
    expect(repeat.status()).toBe(200);
    expect((await repeat.json()).coins).toBe(h.coins);
    await page.screenshot({ path: `${dir}/walk-${site.id}.png` });
    captures.push({ id: site.id, coins: h.coins, visited: h.exploration.visited });
  }
  await page.getByTestId('town-phone-trigger').click();
  await page.getByRole('button', { name: '版图', exact: true }).click();
  await expect(page.getByTestId('town-empire-path')).toBeVisible();
  await expect(page.getByTestId('town-exploration-progress').first()).toHaveAttribute('data-visited', '4');
  await page.screenshot({ path: `${dir}/empire-progress.png` });
  await page.reload();
  await expect(page.getByTestId('town-world')).toBeVisible({ timeout: 30_000 });
  const saved = await home(page);
  expect(saved.exploration.visited).toBe(4);
  expect(saved.exploration.rewardTotal).toBe(120);
  expect(saved.coins).toBe(before.coins + 120);
  expect(saved.business.stage).toBe(before.business.stage);
  expect(saved.exploration.chainReady).toBe(false);
  expect(errors).toEqual([]);
  writeFileSync(`${dir}/exploration.json`, JSON.stringify({ realWalking: true, captures, before: before.coins, after: saved.coins, mission: saved.mission.status, saved: saved.exploration, errors }, null, 2));
});

test('扩图触屏布局：分区视图、八个目的地和版图可操作', async ({ browser, baseURL }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ baseURL, viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await enter(page);
    const before = await home(page);
    await page.getByRole('button', { name: '小地图', exact: true }).click();
    for (const id of ['shop', 'recruit', 'leisure', 'plaza', ...TOWN_OPPORTUNITIES.map(s => s.id)]) {
      const target = page.getByTestId(`town-map-destination-${id}`);
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    for (const view of ['commerce', 'leisure', 'plaza', 'all']) {
      const button = page.locator(`[data-testid="town-map-view"][data-view="${view}"]`);
      await button.click();
      await expect(page.getByTestId('minimap')).toBeVisible();
      if (view === 'commerce' || view === 'leisure') await page.screenshot({ path: `${dir}/touch-${viewport.width}-${view}.png` });
    }
    await page.screenshot({ path: `${dir}/touch-${viewport.width}-map.png` });
    await page.getByTestId('town-map-close').click();
    await page.getByTestId('town-phone-trigger').click();
    await page.getByRole('button', { name: '版图', exact: true }).click();
    await expect(page.getByTestId('town-empire-path')).toBeVisible();
    await page.screenshot({ path: `${dir}/touch-${viewport.width}-empire.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const after = await home(page);
    expect(after.coins).toBe(before.coins);
    expect(after.exploration.visited).toBe(0);
    await context.close();
  }
});
