import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { WorldPlayer } from '../../shared/types.ts';
import type { TeaLiveHome } from '../../shared/teaLive.ts';

const dir = 'artifacts/town-arrival';
mkdirSync(dir, { recursive: true });

type Packet = { id: string; x: number; z: number; moving: boolean };
type PacketWindow = Window & { __townWorldPackets?: Packet[] };

async function tokenOf(page: Page) {
  const token = await page.evaluate(() => sessionStorage.getItem('boss.session'));
  expect(token).toBeTruthy();
  return token!;
}

async function enter(page: Page, id: string) {
  await page.goto('/?lowfx=1');
  await page.getByTestId(`identity-${id}`).click();
  await page.getByTestId('enter-town').click();
  await expect(page.getByTestId('town-world')).toBeVisible();
}

async function waitLive(page: Page, nearby: number) {
  const presence = page.getByTestId('town-presence');
  await expect(presence).toHaveAttribute('data-state', 'live', { timeout: 20_000 });
  await expect(presence).toHaveAttribute('data-nearby', String(nearby), { timeout: 20_000 });
}

async function dismissArrival(page: Page) {
  const arrival = page.getByTestId('town-arrival');
  if (await arrival.count()) {
    await expect(arrival).toBeVisible();
    await page.getByTestId('town-arrival-dismiss').click();
    await expect(arrival).toHaveCount(0);
  }
}

async function worldPos(page: Page, id: string): Promise<WorldPlayer> {
  const res = await page.request.get(new URL('/api/world', page.url()).href, {
    headers: { authorization: `Bearer ${await tokenOf(page)}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json() as { players: WorldPlayer[] };
  const player = body.players.find((p) => p.id === id);
  expect(player, `${id} missing from /api/world`).toBeTruthy();
  return player!;
}

async function teaHome(page: Page): Promise<TeaLiveHome> {
  const res = await page.request.get(new URL('/api/tea/home', page.url()).href, {
    headers: { authorization: `Bearer ${await tokenOf(page)}` },
  });
  expect(res.status()).toBe(200);
  return res.json() as Promise<TeaLiveHome>;
}

async function collectWorld(page: Page) {
  const token = await tokenOf(page);
  await page.evaluate((t) => {
    const win = window as PacketWindow;
    win.__townWorldPackets = [];
    void (async () => {
      const res = await fetch(`/api/events?token=${encodeURIComponent(t)}&world=2`, { cache: 'no-store' });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut = buffer.indexOf('\n\n');
        while (cut >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const data = block.split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          if (data) {
            try {
              const msg = JSON.parse(data) as { type?: string; players?: Packet[] };
              if (msg.type === 'world' && Array.isArray(msg.players)) {
                for (const p of msg.players) {
                  win.__townWorldPackets!.push({ id: p.id, x: p.x, z: p.z, moving: p.moving });
                }
              }
            } catch { /* SSE keepalive/other packet */ }
          }
          cut = buffer.indexOf('\n\n');
        }
      }
    })();
  }, token);
}

async function packets(page: Page) {
  return page.evaluate(() => (window as PacketWindow).__townWorldPackets ?? []);
}

test('演示账号双端到达：真实名牌/SSE移动/离开与首次引导', async ({ browser }) => {
  test.setTimeout(120_000);
  const baseURL = test.info().project.use.baseURL ?? 'http://127.0.0.1:8899';
  const aCtx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const bCtx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const a = await aCtx.newPage();
  const b = await bCtx.newPage();
  const errors: string[] = [];
  a.on('pageerror', (error) => errors.push(`li: ${error.message}`));
  b.on('pageerror', (error) => errors.push(`wang: ${error.message}`));

  await enter(a, 'li');
  await expect(a.getByTestId('town-arrival')).toBeVisible();
  await a.getByTestId('town-arrival-dismiss').click();
  await expect(a.getByTestId('town-arrival')).toHaveCount(0);
  await enter(b, 'wang');
  await dismissArrival(b);
  await waitLive(a, 1);
  await waitLive(b, 1);

  await expect(a.locator('.ptag[data-player="wang"]')).toBeVisible();
  await expect(b.locator('.ptag[data-player="li"]')).toBeVisible();

  await a.getByTestId('town-presence-toggle').click();
  const listA = a.getByTestId('town-nearby-list');
  await expect(listA).toBeVisible();
  await expect(listA).toContainText('老王');
  await expect(listA).not.toContainText('张总');
  await a.getByTestId('town-presence-toggle').click();

  await b.getByTestId('town-presence-toggle').click();
  const listB = b.getByTestId('town-nearby-list');
  await expect(listB).toBeVisible();
  await expect(listB).toContainText('小李');
  await expect(listB).not.toContainText('张总');
  await b.getByTestId('town-presence-toggle').click();
  await a.screenshot({ path: `${dir}/01-two-players.png` });

  // 首次引导已手动关闭；刷新不能再出现，而且没有替玩家接受任务。
  await a.reload();
  await expect(a.getByTestId('town-world')).toBeVisible();
  await expect(a.getByTestId('town-arrival')).toHaveCount(0);
  await waitLive(a, 1);
  await a.getByTestId('town-world').getByRole('button', { name: '手机', exact: true }).click();
  await expect(a.getByTestId('town-phone')).toBeVisible();
  await expect(a.getByTestId('town-mission')).toHaveAttribute('data-status', 'offered');
  await a.getByRole('button', { name: '收起手机', exact: true }).click();
  await expect(a.getByTestId('town-phone')).toHaveCount(0);

  // B 的独立 world=2 SSE 必须真的收到 A 移动后的坐标。
  await collectWorld(b);
  await expect.poll(async () => (await packets(b)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  const baseCount = (await packets(b)).length;
  const initial = await worldPos(a, 'li');
  await a.keyboard.down('KeyW');
  await a.waitForTimeout(900);
  await a.keyboard.up('KeyW');
  await a.waitForTimeout(700);
  const moved = await worldPos(a, 'li');
  expect(Math.hypot(moved.x - initial.x, moved.z - initial.z)).toBeGreaterThan(0.25);

  await expect.poll(async () => {
    const seen = (await packets(b)).slice(baseCount);
    return seen.filter((p) => p.id === 'li'
      && Math.hypot(p.x - moved.x, p.z - moved.z) < 0.35).length;
  }, { timeout: 10_000 }).toBeGreaterThan(0);
  const received = (await packets(b)).slice(baseCount)
    .filter((p) => p.id === 'li' && Math.hypot(p.x - moved.x, p.z - moved.z) < 0.35);
  expect(received.some((p) => Math.hypot(p.x - initial.x, p.z - initial.z) > 0.25)).toBe(true);
  await a.screenshot({ path: `${dir}/02-moved.png` });

  // 关闭 B 的隔离 context：A 的附近人数和列表都必须回落。
  await a.getByTestId('town-presence-toggle').click();
  await expect(a.getByTestId('town-nearby-list')).toContainText('老王');
  await bCtx.close();
  await waitLive(a, 0);
  await expect(a.getByTestId('town-nearby-list')).toHaveCount(0);
  await expect(a.locator('.ptag[data-player="wang"]')).toHaveCount(0);
  await a.screenshot({ path: `${dir}/03-departed.png` });

  writeFileSync(`${dir}/presence.json`, JSON.stringify({
    demo: true,
    players: ['li', 'wang'],
    arrival: { first: true, dismissed: true, reloadPersisted: true, mission: 'offered' },
    presence: { aState: 'live', aNearby: 0, bState: 'live', bNearby: 1, npcExcluded: true },
    nearbyNames: { li: ['老王'], wang: ['小李'] },
    movement: {
      from: { x: initial.x, z: initial.z },
      to: { x: moved.x, z: moved.z },
      bPackets: received.length,
      sse: '/api/events?world=2',
    },
    errors,
  }, null, 2));
  expect(errors).toEqual([]);
  await aCtx.close();
});

test('welcome 未确认入镇时不会建立 world SSE', async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL ?? 'http://127.0.0.1:8899';
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const events: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/events')) events.push(request.url());
  });
  await page.goto('/?lowfx=1');
  await page.getByTestId('identity-li').click();
  await expect(page.getByTestId('welcome-profile')).toBeVisible();
  await expect(page.getByTestId('town-world')).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(events).toEqual([]);
  await ctx.close();
});

test('断网恢复：offline 提示真实、恢复后仍在小镇且不扣费', async ({ browser }) => {
  test.setTimeout(60_000);
  const baseURL = test.info().project.use.baseURL ?? 'http://127.0.0.1:8899';
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await enter(page, 'li');
    await waitLive(page, 0);
    await expect(page.getByTestId('town-arrival')).toBeVisible();
    const before = await teaHome(page);
    expect(before.mission.status).toBe('offered');

    await ctx.setOffline(true);
    const presence = page.getByTestId('town-presence');
    await expect(presence).toHaveAttribute('data-state', 'offline', { timeout: 10_000 });
    await expect(presence).toContainText('重连中');
    await expect(presence).toHaveAttribute('data-nearby', '0');
    await expect(page.getByTestId('town-nearby-list')).toHaveCount(0);
    await expect(page.getByTestId('town-arrival')).toHaveCount(0);
    await page.screenshot({ path: `${dir}/04-offline.png` });

    await ctx.setOffline(false);
    await expect(presence).toHaveAttribute('data-state', 'live', { timeout: 15_000 });
    await expect(page.getByTestId('town-world')).toBeVisible();
    await expect(page.getByTestId('enter-town')).toHaveCount(0);
    await expect(page.getByTestId('welcome-profile')).toHaveCount(0);
    const after = await teaHome(page);
    expect(after.coins).toBe(before.coins);
    expect(after.mission.status).toBe('offered');
    await page.screenshot({ path: `${dir}/05-reconnected.png` });

    writeFileSync(`${dir}/offline.json`, JSON.stringify({
      demo: true,
      account: 'li',
      offline: { state: 'offline', text: '重连中', nearby: 0, arrival: false },
      online: { state: 'live', world: true, relogin: false, coins: after.coins, mission: after.mission.status },
      coinsBefore: before.coins,
      coinsAfter: after.coins,
    }, null, 2));
  } finally {
    await ctx.close();
  }
});
