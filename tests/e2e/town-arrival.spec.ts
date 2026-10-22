import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { WorldPlayer } from '../../shared/types.ts';
import type { TeaLiveHome } from '../../shared/teaLive.ts';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset')).ok()).toBeTruthy();
});

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

test('私人小镇双端到达：默认独处、SSE房间隔离与首次引导', async ({ browser }) => {
  test.setTimeout(120_000);
  const baseURL = test.info().project.use.baseURL ?? 'http://127.0.0.1:8899';
  const aCtx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const bCtx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const a = await aCtx.newPage(); const b = await bCtx.newPage();
  const errors: string[] = [];
  a.on('pageerror', error => errors.push(error.message));
  b.on('pageerror', error => errors.push(error.message));
  try {
    await enter(a, 'li'); await dismissArrival(a);
    await enter(b, 'wang'); await dismissArrival(b);
    await waitLive(a, 0); await waitLive(b, 0);
    await expect(a.locator('.ptag[data-player="wang"]')).toHaveCount(0);
    await expect(b.locator('.ptag[data-player="li"]')).toHaveCount(0);
    await expect(a.getByTestId('town-presence-toggle')).toBeDisabled();
    await expect(a.getByTestId('town-nearby-list')).toHaveCount(0);
    await a.screenshot({ path: `${dir}/01-private-town.png` });
    await a.reload(); await expect(a.getByTestId('town-world')).toBeVisible();
    await expect(a.getByTestId('town-arrival')).toHaveCount(0); await waitLive(a, 0);
    await a.getByTestId('town-world').getByRole('button', { name: '手机', exact: true }).click();
    await expect(a.getByTestId('town-mission')).toHaveAttribute('data-status', 'offered');
    await a.getByRole('button', { name: '收起手机', exact: true }).click();
    await collectWorld(b);
    await expect.poll(async () => (await packets(b)).length, { timeout: 10000 }).toBeGreaterThan(0);
    const initial = await worldPos(a, 'li');
    await a.keyboard.down('KeyW'); await a.waitForTimeout(900); await a.keyboard.up('KeyW');
    await expect.poll(async () => { const p = await worldPos(a, 'li'); return Math.hypot(p.x-initial.x,p.z-initial.z); }).toBeGreaterThan(0.25);
    expect((await packets(b)).some(p => p.id === 'li')).toBe(false);
    await bCtx.close(); await waitLive(a, 0);
    writeFileSync(`${dir}/private-presence.json`, JSON.stringify({ privateTown: true, aNearby: 0, bNearby: 0, strangerPackets: 0, arrivalSkipPersists: true, errors }, null, 2));
    expect(errors).toEqual([]);
  } finally { await aCtx.close(); await bCtx.close().catch(() => undefined); }
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
    await expect(page.getByTestId('town-arrival')).toBeVisible();
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
      offline: { state: 'offline', text: '重连中', nearby: 0, arrival: true },
      online: { state: 'live', world: true, relogin: false, coins: after.coins, mission: after.mission.status },
      coinsBefore: before.coins,
      coinsAfter: after.coins,
    }, null, 2));
  } finally {
    await ctx.close();
  }
});
