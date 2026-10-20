import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// V3 acceptance: playful campus, real rewards and wearable items. Legacy video remains V1.
const SHOTS = 'artifacts/playful-v3/e2e';
mkdirSync(SHOTS, { recursive: true });
interface Player {
  ctx: BrowserContext;
  page: Page;
  errors: string[];
}

async function openPlayer(
  browser: Browser,
  id: string,
  viewport = { width: 1440, height: 900 },
): Promise<Player> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId(`identity-${id}`).click();
  await expect(page.getByTestId('my-coins')).toBeVisible();
  await expect(page.locator(`.ptag.you[data-player="${id}"]`)).toBeVisible();
  await expect(page.getByTestId('btn-skip-intro')).toBeHidden({
    timeout: 5000,
  });
  return { ctx, page, errors };
}
const coins = async (p: Page) =>
  Number(await p.getByTestId('my-coins').getAttribute('data-value'));
const position = async (p: Page) => {
  if (!(await p.getByTestId('minimap').isVisible()))
    await p.getByTestId('btn-map').click();
  const transform = await p
    .getByTestId('minimap')
    .locator('g')
    .last()
    .getAttribute('transform');
  const match = transform?.match(/translate\(([-\d.e]+) ([-\d.e]+)\)/);
  if (!match) throw new Error(`Missing map position: ${transform}`);
  return [Number(match[1]), Number(match[2])];
};
async function roster(p: Page) {
  await p.getByTestId('btn-menu').click();
  await p.getByTestId('btn-open-market').click();
  await expect(p.getByTestId('market')).toBeVisible();
}
async function closeDrawer(p: Page) {
  await p.getByRole('button', { name: '关闭', exact: true }).click();
}
async function quote(p: Page, id: string) {
  await roster(p);
  await p.getByTestId(`sign-${id}`).click();
  await expect(p.getByTestId('confirm-trade')).toBeVisible();
}
async function sign(p: Page, id: string) {
  await quote(p, id);
  const response = p.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/colleagues/${id}/sign`) &&
      r.request().method() === 'POST',
  );
  await p.getByTestId('confirm-trade-ok').click();
  expect((await response).status()).toBe(200);
  await expect(p.getByTestId('confirm-trade')).toBeHidden();
  await closeDrawer(p);
}
async function project(p: Page) {
  await p.getByTestId('btn-project').click();
  await p.getByTestId('btn-project-start').click();
  const deadline = Date.now() + 30_000;
  while (
    Date.now() < deadline &&
    !(await p
      .getByTestId('project-result')
      .isVisible()
      .catch(() => false))
  ) {
    // Read only visible belt cards, then use the same single button a human uses.
    // Do not generate tasks or fabricate action logs from internal game state.
    const front = await p
      .locator('.belt-item.in')
      .evaluateAll(
        (items) =>
          items
            .map((el) => ({
              trap: el.classList.contains('trap'),
              left: parseFloat((el as HTMLElement).style.left),
            }))
            .sort((a, b) => b.left - a.left)[0] ?? null,
      );
    if (front && !front.trap) await p.getByTestId('btn-project-act').click();
    await p.waitForTimeout(110);
  }
  await expect(p.getByTestId('project-result')).toBeVisible();
  await expect(p.getByTestId('project-verify')).toContainText('结算已核对');
  const earned = Number(
    (await p.locator('.result-total b').innerText()).replace(/,/g, ''),
  );
  expect(earned).toBeGreaterThan(0);
  await p.getByTestId('btn-project-close').click();
  return earned;
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset')).ok()).toBeTruthy();
});
test.afterEach(async ({ browser }) => {
  for (const ctx of browser.contexts()) await ctx.close();
});

test('V3 login: one click, clearly marked test identity, no forced guide or market', async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(
    page.getByText('体验账号 · 非真实SSO', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.identity')).toHaveCount(4);
  await page.getByTestId('identity-wang').click();
  await expect(page.getByTestId('my-coins')).toHaveAttribute(
    'data-value',
    '600',
  );
  await expect(page.locator('.ptag.you')).toBeVisible();
  await expect(page.getByTestId('market')).toHaveCount(0);
  await expect(page.getByTestId('guide')).toHaveCount(0);
  await expect(page.getByTestId('btn-skip-intro')).toBeHidden({
    timeout: 5000,
  });
  await page.screenshot({ path: `${SHOTS}/01-new-home.png` });
});

test('V3 exploration: keyboard movement, map walking, and typing stops navigation', async ({
  browser,
}) => {
  const a = await openPlayer(browser, 'wang');
  const before = await position(a.page);
  await a.page.keyboard.down('d');
  await a.page.waitForTimeout(800);
  await a.page.keyboard.up('d');
  const after = await position(a.page);
  expect(
    Math.hypot(after[0] - before[0], after[1] - before[1]),
  ).toBeGreaterThan(1);
  await a.page
    .getByTestId('minimap')
    .locator('text')
    .filter({ hasText: '☕' })
    .click();
  await a.page.getByRole('button', { name: '聊天', exact: true }).click();
  await a.page.getByTestId('chat-input').focus();
  await a.page.waitForTimeout(150);
  const paused = await position(a.page);
  await a.page.getByTestId('chat-input').fill('wasd');
  await a.page.waitForTimeout(600);
  const still = await position(a.page);
  expect(Math.hypot(still[0] - paused[0], still[1] - paused[1])).toBeLessThan(
    0.1,
  );
  await a.page.getByTestId('chat-input').press('Escape');
  await a.page
    .getByTestId('minimap')
    .locator('text')
    .filter({ hasText: '☕' })
    .click();
  await expect(a.page.getByTestId('zone-name')).toContainText('咖啡', {
    timeout: 20_000,
  });
  await a.page.screenshot({ path: `${SHOTS}/02-coffee-exploration.png` });
  expect(a.errors).toEqual([]);
});

test('V3 real social: two identities, wave, bubble, both wallets +15, offline disappearance', async ({
  browser,
}) => {
  const a = await openPlayer(browser, 'wang');
  const b = await openPlayer(browser, 'li');
  await expect(a.page.locator('.ptag[data-player="li"]')).toBeVisible();
  await expect(b.page.locator('.ptag[data-player="wang"]')).toBeVisible();
  await b.page.getByTestId('emote-wave').click();
  await expect(a.page.locator('.ptag[data-player="li"] .emote-pop')).toHaveText(
    '👋',
  );
  await b.page.waitForTimeout(1100);
  await b.page.getByRole('button', { name: '聊天', exact: true }).click();
  await b.page.getByTestId('chat-input').fill('一起逛园区');
  await b.page.getByTestId('chat-input').press('Enter');
  await expect(a.page.locator('.ptag[data-player="li"] .bubble')).toHaveText(
    '一起逛园区',
  );
  await b.page.getByTestId('ic-highfive').click();
  await expect.poll(() => coins(a.page)).toBe(615);
  await expect.poll(() => coins(b.page)).toBe(615);
  await expect(b.page.getByTestId('ic-highfive')).toBeDisabled();
  await a.page.screenshot({ path: `${SHOTS}/03-two-player-social.png` });
  await b.ctx.close();
  await expect(a.page.locator('.ptag[data-player="li"]')).toHaveCount(0);
  expect(a.errors).toEqual([]);
});

test('V3 economy: recruit, poach, single input project, avatar dividend and persistence', async ({
  browser,
}) => {
  const a = await openPlayer(browser, 'wang');
  const b = await openPlayer(browser, 'li');
  await sign(a.page, 'c-zhang');
  await expect.poll(() => coins(a.page)).toBe(300);
  await expect(
    b.page.locator('.ctag[data-colleague="c-zhang"]'),
  ).toHaveAttribute('data-owner', 'wang');
  await sign(b.page, 'c-zhang');
  await expect.poll(() => coins(a.page)).toBe(642);
  await expect.poll(() => coins(b.page)).toBe(220);
  await expect(
    a.page.locator('.ctag[data-colleague="c-zhang"]'),
  ).toHaveAttribute('data-owner', 'li');
  const reward = await project(b.page);
  await expect.poll(() => coins(b.page)).toBe(220 + reward);
  // A can afford B's avatar independently of how well the tester plays.
  await sign(a.page, 'c-li');
  await expect.poll(() => coins(b.page)).toBe(235 + reward);
  await expect.poll(() => coins(a.page)).toBe(342);
  await a.page.reload();
  await expect(a.page.getByTestId('my-coins')).toHaveAttribute(
    'data-value',
    '342',
  );
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test('V3 concurrent purchase: one quoted trade wins and the other sees a conflict', async ({
  browser,
}) => {
  const a = await openPlayer(browser, 'wang');
  const b = await openPlayer(browser, 'liu');
  await quote(a.page, 'c-tony');
  await quote(b.page, 'c-tony');
  const responses = [a.page, b.page].map((p) =>
    p.waitForResponse(
      (r) =>
        r.url().endsWith('/api/colleagues/c-tony/sign') &&
        r.request().method() === 'POST',
    ),
  );
  await Promise.all([
    a.page.getByTestId('confirm-trade-ok').click(),
    b.page.getByTestId('confirm-trade-ok').click(),
  ]);
  const statuses = await Promise.all(
    responses.map(async (response) => (await response).status()),
  );
  expect(statuses.sort()).toEqual([200, 409]);
  await expect
    .poll(async () => (await coins(a.page)) + (await coins(b.page)))
    .toBe(900);
});

test('V3 disabled states: self avatar, owned teammate and insufficient funds', async ({
  browser,
}) => {
  const a = await openPlayer(browser, 'mei');
  await roster(a.page);
  await expect(a.page.getByTestId('sign-c-mei')).toBeDisabled();
  await closeDrawer(a.page);
  await sign(a.page, 'c-lily');
  await sign(a.page, 'c-qiang');
  await roster(a.page);
  await expect(a.page.getByTestId('sign-c-lily')).toBeDisabled();
  await expect(a.page.getByTestId('sign-c-tony')).toBeDisabled();
});

test('V3 mobile: 390x844 layout, menu and message layer', async ({
  browser,
}) => {
  const a = await openPlayer(browser, 'mei', { width: 390, height: 844 });
  expect(
    await a.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await a.page.getByTestId('btn-menu').click();
  await a.page.getByTestId('btn-messages').click();
  await expect(
    a.page.getByRole('dialog', { name: '消息', exact: true }),
  ).toBeVisible();
  await a.page.screenshot({ path: `${SHOTS}/04-mobile-messages.png` });
  await closeDrawer(a.page);
  expect(a.errors).toEqual([]);
});

test('V3 annual loop: three real games, promotion, bonus, purchase and persisted boss outfit', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await openPlayer(browser, 'wang');
  await sign(a.page, 'c-zhang');
  await project(a.page);
  await a.page
    .getByRole('button', { name: '查看晋升成长', exact: true })
    .click();
  await expect(a.page.getByTestId('btn-promote')).toBeEnabled();
  await a.page.getByTestId('btn-promote').click();
  await expect(
    a.page.getByRole('dialog', { name: '晋升 · 项目专员', exact: true }),
  ).toBeVisible();
  await a.page.getByTestId('progression-close').click();
  await project(a.page);
  const before = await coins(a.page);
  const response = a.page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/project/finish') &&
      r.request().method() === 'POST',
  );
  const earned = await project(a.page);
  const settlement = await (await response).json();
  expect(settlement.yearAward.total).toBeGreaterThanOrEqual(300);
  await expect
    .poll(() => coins(a.page))
    .toBe(before + earned + settlement.yearAward.total);
  await expect(
    a.page.getByRole('dialog', { name: '第 1 年 · 年终奖到啦', exact: true }),
  ).toBeVisible();
  await a.page
    .getByRole('button', { name: '去换点喜欢的', exact: true })
    .click();
  await a.page.getByRole('button', { name: '给老板', exact: true }).click();
  await a.page.getByTestId('shop-item-mint-shirt').click();
  const balance = await coins(a.page);
  await a.page.getByTestId('shop-purchase').click();
  await expect(a.page.getByTestId('shop-purchase')).toHaveText('已穿戴');
  await expect.poll(() => coins(a.page)).toBe(balance - 160);
  await a.page.getByTestId('progression-close').click();
  await a.page.reload();
  await expect(a.page.getByTestId('my-coins')).toHaveAttribute(
    'data-value',
    String(balance - 160),
  );
  await a.page.getByTestId('btn-shop').click();
  await a.page.getByRole('button', { name: '给老板', exact: true }).click();
  await a.page.getByTestId('shop-item-mint-shirt').click();
  await expect(a.page.getByTestId('shop-purchase')).toBeDisabled();
  await expect(a.page.getByTestId('shop-purchase')).toHaveText('已穿戴');
  expect(a.errors).toEqual([]);
});
