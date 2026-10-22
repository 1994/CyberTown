import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { TeaSession } from '../../shared/teaLive.ts';

const dir = 'artifacts/tea-chapter'; mkdirSync(dir, { recursive: true });
const evidence: Record<string, unknown> = {};
async function token(page: Page) { return await page.evaluate(() => sessionStorage.getItem('boss.session')!); }
async function state(page: Page, id: string): Promise<TeaSession> {
  const res = await page.request.get(`/api/tea/sessions/${id}`, { headers: { authorization: `Bearer ${await token(page)}` } });
  expect(res.status()).toBe(200); return await res.json() as TeaSession;
}
async function enter(page: Page, player: string) {
  await page.goto('/?lowfx=1'); await page.getByTestId(`identity-${player}`).click();
  await expect(page.getByRole('button', { name: '开门', exact: true })).toBeVisible();
  const response = page.waitForResponse(r => r.url().endsWith('/api/tea/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '开门', exact: true }).click();
  const opened = await response; expect(opened.status()).toBe(200); return await opened.json() as TeaSession;
}
async function start(page: Page, mode: 'practice' | 'official') {
  const response = page.waitForResponse(r => r.url().endsWith('/api/tea/sessions') && r.request().method() === 'POST');
  if (mode === 'practice') await page.getByRole('button', { name: '免费试营业', exact: true }).click();
  else { await page.getByRole('button', { name: /^正式开店/ }).click(); await page.getByRole('button', { name: /^预付.*开店/ }).click(); }
  const opened = await response; expect(opened.status()).toBe(200); return await opened.json() as TeaSession;
}
async function hire(page: Page, name: string) {
  await page.locator('.tea-card').filter({ hasText: name }).locator('.tea-card-main').click();
  await page.getByRole('button', { name: '去奶茶店 →', exact: true }).click();
  await expect(page.locator('.tea-prep')).toBeVisible();
}
async function stable(page: Page) { await page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise<void>(r => requestAnimationFrame(() => r())); }); }
async function contained(page: Page) {
  const width = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport + 1);
}
async function play(page: Page, initial: TeaSession, label: string, opts: { fast?: boolean; skipAfter?: number; resume?: boolean; pause?: boolean } = {}) {
  const started = Date.now(); let s = initial; let captured = false; let restored = false; let paused = false;
  if (opts.fast) await page.getByRole('button', { name: 'x2', exact: true }).click();
  while (s.status === 'active') {
    s = await state(page, s.id); if (s.status === 'finished') break;
    if (!captured && s.frame.served > 0) { await stable(page); await page.screenshot({ path: `${dir}/${label}.png` }); captured = true; }
    if (opts.pause && !paused && s.frame.served > 0) {
      await page.getByRole('button', { name: '暂停', exact: true }).click(); await page.waitForTimeout(200);
      const before = await state(page, s.id); await page.waitForTimeout(700); const after = await state(page, s.id);
      expect(after.t).toBe(before.t); await page.getByRole('button', { name: '继续', exact: true }).click(); paused = true;
    }
    if (opts.resume && !restored && s.frame.served >= 2) {
      const before = s; await page.reload(); await expect(page.locator('.tea-dock')).toBeVisible();
      const after = await state(page, s.id); expect(after.id).toBe(before.id); expect(after.t).toBeGreaterThanOrEqual(before.t);
      await page.getByRole('button', { name: '继续', exact: true }).click(); restored = true;
    }
    if (opts.skipAfter && s.frame.served >= opts.skipAfter) {
      await page.getByRole('button', { name: /^跳过/ }).click();
      await expect(page.locator('.tea-report')).toBeVisible(); s = await state(page, s.id); break;
    }
    if (s.frame.selfTask.role === 'idle') {
      const { cashierQueue: cq, makerQueue: mq } = s.frame;
      const threshold = s.run.workers.length >= 3 ? 4 : 0;
      if (Math.max(cq, mq) > threshold) {
        const role = s.run.workers.length === 2 ? 'cashier' : mq >= cq ? 'maker' : 'cashier';
        const button = page.getByRole('button', { name: role === 'maker' ? /^制作一批/ : /^接待一批/ });
        if (await button.isEnabled()) await button.click();
      }
    }
    await page.waitForTimeout(180);
  }
  await expect(page.locator('.tea-report')).toBeVisible(); await contained(page);
  expect(s.run.settledAt).toBeGreaterThan(0);
  return { ...s, realSeconds: (Date.now() - started) / 1000, restored, paused };
}

test('完整首章：独自→一位→两位同事→真实正式营业→升级旗舰（正常节奏）', async ({ page }) => {
  test.setTimeout(330_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const opened = await enter(page, 'wang'); expect(opened.run.workers).toHaveLength(1); expect(opened.run.result.completed).toBe(0); expect(opened.run.settledAt).toBe(0);
  const initialCoins = await page.locator('.tea-wallet b').innerText();
  const solo = await play(page, opened, '01-solo-desktop', { pause: true });
  expect(solo.run.result.completed).toBeGreaterThan(0); await expect(page.locator('.tea-wallet b')).toHaveText(initialCoins);
  await page.getByRole('button', { name: '去招第一位同事 →', exact: true }).click();
  await page.screenshot({ path: `${dir}/02-first-hire-desktop.png` }); await hire(page, '老王');
  const duo = await play(page, await start(page, 'practice'), '03-duo-desktop', { resume: true });
  expect(duo.run.workers).toHaveLength(2); expect(duo.run.result.events.some(e => e.type === 'making_started' && e.workerId === 'demo-wang')).toBe(true);
  await expect(page.locator('.tea-wallet b')).toHaveText(initialCoins);
  await page.getByRole('button', { name: '去招第二位同事 →', exact: true }).click(); await hire(page, '小李');
  await expect(page.locator('.tea-assign')).toHaveCount(3); await page.screenshot({ path: `${dir}/04-rush-prep-desktop.png` });
  const keys: string[] = []; let firstId = '';
  await page.route('**/api/tea/sessions', async route => {
    const input = route.request().postDataJSON(); if (input.mode !== 'official') { await route.continue(); return; }
    keys.push(input.idempotencyKey);
    if (keys.length === 1) { const response = await route.fetch(); expect(response.status()).toBe(200); firstId = (await response.json()).id; await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: /^正式开店/ }).click(); await page.getByRole('button', { name: /^预付.*开店/ }).click();
  await expect(page.getByRole('status')).toContainText('重试');
  const rush = await start(page, 'official'); expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]); expect(rush.id).toBe(firstId);
  expect(rush.run.settledAt).toBe(0); expect(rush.run.result.completed).toBe(0);
  const official = await play(page, rush, '05-rush-desktop'); expect(official.run.result.passed).toBe(true);
  await page.screenshot({ path: `${dir}/06-official-report-desktop.png` });
  await page.getByRole('button', { name: '去升级门店 →', exact: true }).click();
  await page.getByRole('button', { name: '焕新小店 ¥600', exact: true }).click();
  await expect(page.locator('.tea-ending')).toContainText('同事接管日常'); await page.screenshot({ path: `${dir}/07-chapter-complete-desktop.png` });
  await page.getByRole('button', { name: '升级旗舰 ¥1200', exact: true }).click(); await expect(page.locator('.tea-ending')).toContainText('主线完成');
  await page.screenshot({ path: `${dir}/08-mainline-complete-desktop.png` });
  const wallet = await page.locator('.tea-wallet b').innerText(); await page.reload(); await expect(page.locator('.tea-root')).toBeVisible();
  await expect(page.locator('.tea-wallet b')).toHaveText(wallet); await expect(page.locator('.tea-guide')).toContainText('主线完成');
  expect(errors).toEqual([]);
  evidence.desktop = { solo: { completed: solo.run.result.completed, batches: solo.commands.length, realSeconds: solo.realSeconds },
    duo: { completed: duo.run.result.completed, batches: duo.commands.length, realSeconds: duo.realSeconds, reloadResumed: duo.restored },
    official: { completed: official.run.result.completed, batches: official.commands.length, realSeconds: official.realSeconds,
      cost: official.hold, profit: official.run.result.profit, bonus: official.run.result.bonus, coinsAfter: official.run.coinsAfter },
    sameOpeningRetry: keys[0] === keys[1], firstUpgrade: true, flagshipPersisted: true, errors };
  writeFileSync(`${dir}/ui-acceptance.json`, JSON.stringify(evidence, null, 2));
});

test('手机：首章全闭环、真实半自动、横竖屏可操作', async ({ page }) => {
  test.setTimeout(150_000); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const solo = await play(page, await enter(page, 'mei'), '09-solo-mobile', { fast: true, skipAfter: 1 });
  await page.getByRole('button', { name: '去招第一位同事 →', exact: true }).click(); await stable(page);
  await page.screenshot({ path: `${dir}/10-recruit-mobile.png` }); await contained(page); await hire(page, '老王');
  const duo = await play(page, await start(page, 'practice'), '11-duo-mobile', { fast: true, skipAfter: 3 });
  await page.getByRole('button', { name: '去招第二位同事 →', exact: true }).click(); await hire(page, '小李');
  await page.setViewportSize({ width: 844, height: 390 }); await stable(page); await contained(page);
  await page.screenshot({ path: `${dir}/12-prep-landscape.png` });
  await expect(page.getByRole('button', { name: /^正式开店/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await stable(page);
  const official = await play(page, await start(page, 'official'), '13-rush-mobile', { fast: true });
  expect(official.run.result.passed).toBe(true); await page.getByRole('button', { name: '去升级门店 →', exact: true }).click();
  await page.getByRole('button', { name: '焕新小店 ¥600', exact: true }).click(); await expect(page.locator('.tea-ending')).toContainText('同事接管日常');
  await page.screenshot({ path: `${dir}/14-chapter-complete-mobile.png` }); expect(errors).toEqual([]);
  evidence.mobile = { solo: solo.run.result.completed, duo: duo.run.result.completed, official: official.run.result.completed, viewports: ['390x844', '844x390'], errors };
  writeFileSync(`${dir}/ui-acceptance.json`, JSON.stringify(evidence, null, 2));
});
