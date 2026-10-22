import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = 'artifacts/town-districts';
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
  await expect(page.getByTestId('town-arrival')).toBeVisible();
  await page.getByTestId('town-arrival-dismiss').click();
  await expect(page.getByTestId('town-arrival')).toHaveCount(0);
}
function mapButton(page: Page) {
  return page.getByTestId('town-world').getByRole('button', { name: /地图/ }).first();
}
async function openMap(page: Page) {
  if (!(await page.getByTestId('town-map-destination-shop').isVisible().catch(() => false))) {
    await mapButton(page).click();
  }
  await expect(page.getByTestId('town-map-destination-shop')).toBeVisible();
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
async function mapHit(page: Page, locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  const hitMap = await page.evaluate(({ px, py }) => {
    const hit = document.elementFromPoint(px, py);
    const map = hit?.closest('.town-map');
    const dialog = document.querySelector('[role="dialog"][aria-label="小镇地图"]');
    return !!map && !!dialog && dialog.contains(map);
  }, { px: x, py: y });
  expect(hitMap).toBe(true);
}
async function mapUnobstructed(page: Page) {
  const dialog = page.locator('[role="dialog"][aria-label="小镇地图"]');
  await expect(dialog).toBeVisible();
  await mapHit(page, dialog.locator('header b').first());
  const north = dialog.locator('svg text').filter({ hasText: '北区' }).first();
  await expect(north).toBeVisible();
  await mapHit(page, north);
}
async function shot(page: Page, name: string) {
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
}
async function openMapForViewport(browser: Browser, baseURL: string, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ baseURL, viewport, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await enter(page, 'wang');
  await expect(page.getByTestId('town-presence')).toBeVisible();
  await openMap(page);
  await mapUnobstructed(page);
  return { ctx, page };
}

test('桌面街区导航：地图分区、真实步行到娱乐/广场/店门与 WASD 中断', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page, 'wang');
  const before = await home(page);
  await openMap(page);

  const mini = page.getByTestId('minimap');
  await expect(mini.getByText(/商业街|商业区/).first()).toBeVisible();
  await expect(mini.getByText(/娱乐街|娱乐区/).first()).toBeVisible();
  await expect(mini.getByText('共享广场').first()).toBeVisible();
  await shot(page, '01-desktop-map');

  await page.getByTestId('town-map-destination-leisure').click();
  const nav = page.getByTestId('town-navigation');
  await expect(nav).toHaveAttribute('data-target', 'leisure');
  await expect(nav).toHaveAttribute('data-status', 'walking');
  await openMap(page);
  const route = page.getByTestId('town-map-route');
  await expect(route).toBeVisible();
  const routePoints = (await route.evaluate((el) => el.getAttribute('points')
    ?? el.querySelector('polyline')?.getAttribute('points') ?? '')).trim();
  expect(routePoints).toBeTruthy();
  expect(routePoints.split(/\s+/).length).toBeGreaterThanOrEqual(2);
  await page.getByTestId('town-map-close').click();
  await expect(nav).toHaveAttribute('data-status', 'arrived', { timeout: 25_000 });
  await expect(page.getByTestId('town-district')).toHaveAttribute('data-district', 'leisure');
  await shot(page, '02-desktop-leisure');

  await openMap(page);
  await page.getByTestId('town-map-destination-plaza').click();
  await expect(page.getByTestId('town-navigation')).toHaveAttribute('data-target', 'plaza');
  await expect(page.getByTestId('town-navigation')).toHaveAttribute('data-status', 'arrived', { timeout: 25_000 });
  await expect(page.getByTestId('town-district')).toHaveAttribute('data-district', 'plaza');
  await openMap(page);
  await page.getByTestId('town-map-destination-shop').click();
  await expect(page.getByTestId('town-navigation')).toHaveAttribute('data-target', 'shop');
  await expect(page.getByTestId('town-navigation')).toHaveAttribute('data-status', 'walking');
  await expect(page.getByTestId('town-navigation')).toHaveAttribute('data-status', 'arrived', { timeout: 30_000 });
  await expect(page.getByTestId('town-district')).toHaveAttribute('data-district', 'commerce');
  await expect(page.getByTestId('town-enter-shop')).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('.tea-prep')).toHaveCount(0);

  await openMap(page);
  await page.getByTestId('town-map-destination-recruit').click();
  await expect(page.getByTestId('town-navigation')).toHaveAttribute('data-status', 'walking');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => {
    const current = page.getByTestId('town-navigation');
    return await current.count() ? await current.getAttribute('data-status') : 'hidden';
  }, { timeout: 5_000 }).not.toBe('walking');
  await openMap(page);
  await expect(page.getByTestId('town-map-destination-plaza')).toBeVisible();
  await page.getByTestId('town-map-close').click();
  await expect(page.getByTestId('town-map-destination-plaza')).toHaveCount(0);
  await openMap(page);
  await expect(page.getByTestId('town-map-destination-leisure')).toBeVisible();

  const after = await home(page);
  expect(after.coins).toBe(before.coins);
  expect(after.mission.status).toBe(before.mission.status);
  writeFileSync(`${dir}/desktop.json`, JSON.stringify({
    demo: 'wang', districts: ['commerce', 'leisure', 'plaza'], visited: ['leisure', 'plaza', 'shop'],
    wasdInterrupts: true, noIndoorBeforeClick: true, coinsBefore: before.coins, coinsAfter: after.coins,
    mission: after.mission.status, errors,
  }, null, 2));
  expect(errors).toEqual([]);
});

test('移动端地图布局：竖屏/横屏目标可点、无溢出、可关闭重开且不扣金币', async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL ?? 'http://127.0.0.1:8899';
  const portrait = await openMapForViewport(browser, baseURL, { width: 390, height: 844 });
  const p = portrait.page;
  const pBefore = await home(p);
  for (const id of ['shop', 'recruit', 'leisure', 'plaza']) {
    const button = p.getByTestId(`town-map-destination-${id}`);
    await expect(button).toBeVisible();
    await inViewport(button, p);
  }
  await expect.poll(() => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await shot(p, '03-portrait-map');
  await p.getByTestId('town-map-close').click();
  await expect(p.getByTestId('town-map-destination-shop')).toHaveCount(0);
  await openMap(p);
  await expect(p.getByTestId('town-map-close')).toBeVisible();
  const pAfter = await home(p);
  expect(pAfter.coins).toBe(pBefore.coins);
  expect(pAfter.mission.status).toBe(pBefore.mission.status);
  await portrait.ctx.close();

  const landscape = await openMapForViewport(browser, baseURL, { width: 844, height: 390 });
  const l = landscape.page;
  const lBefore = await home(l);
  for (const id of ['shop', 'recruit', 'leisure', 'plaza']) {
    const button = l.getByTestId(`town-map-destination-${id}`);
    await expect(button).toBeVisible();
    await inViewport(button, l);
  }
  await expect.poll(() => l.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await shot(l, '04-landscape-map');
  await l.getByTestId('town-map-close').click();
  await openMap(l);
  await expect(l.getByTestId('town-map-destination-leisure')).toBeVisible();
  expect((await home(l)).coins).toBe(lBefore.coins);
  expect((await home(l)).mission.status).toBe(lBefore.mission.status);
  await landscape.ctx.close();

  expect(pBefore.mission.status).toBe('offered');
  writeFileSync(`${dir}/mobile.json`, JSON.stringify({
    demo: 'wang', portrait: { width: 390, height: 844, noOverflow: true, closeReopen: true },
    landscape: { width: 844, height: 390, noOverflow: true, closeReopen: true },
    coinsBefore: pBefore.coins, coinsAfter: pAfter.coins, mission: pAfter.mission.status,
  }, null, 2));
});
