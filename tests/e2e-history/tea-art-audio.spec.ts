import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { TeaSession } from '../../shared/teaLive.ts';

const dir = 'artifacts/tea-chapter'; mkdirSync(dir, { recursive: true });

// The sound test prepares the completed teaching services through the same
// public session API as the browser. The full UI journey has its own test.
async function prepareChapter(page: Page) {
  const login = await page.request.post('/api/auth/test-login', { data: { playerId: 'li' } });
  const { token } = await login.json(); const headers = { authorization: `Bearer ${token}` };
  for (const lesson of ['solo', 'duo']) {
    const assignments = [{ workerId: 'self', role: 'support' }, ...(lesson === 'duo' ? [{ workerId: 'demo-wang', role: 'maker' }] : [])];
    const opened = await page.request.post('/api/tea/sessions', { headers, data: { lesson, mode: 'practice', plan: { assignments, stock: 80, strategy: 'balanced' }, idempotencyKey: `sound-${lesson}` } });
    expect(opened.status()).toBe(200); let s = await opened.json() as TeaSession;
    while (s.status === 'active') {
      const q = s.frame; const assign = q.selfTask.role === 'idle' && Math.max(q.cashierQueue, q.makerQueue) > 0
        ? q.makerQueue >= q.cashierQueue ? 'maker' : 'cashier' : undefined;
      const res = await page.request.post(`/api/tea/sessions/${s.id}/step`, { headers,
        data: { revision: s.revision, advance: 1, assign, requestId: `sound-${lesson}-${s.revision}` } });
      expect(res.status()).toBe(200); s = await res.json() as TeaSession;
    }
    expect(s.run.result.completed).toBeGreaterThan(0);
  }
}

test('正常画质与声音：半自动会话中五场景配乐、静音、音量保存和跳过', async ({ page }) => {
  test.setTimeout(60_000); await prepareChapter(page);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?audio=debug'); const diag = page.getByTestId('sound-diagnostics');
  await expect(diag).toHaveAttribute('data-state', 'locked'); await expect(diag).toHaveAttribute('data-music-notes', '0');
  await page.getByTestId('identity-li').click(); await page.getByRole('button', { name: '开门', exact: true }).click();
  await expect(page.locator('.tea-root')).toBeVisible(); await expect(diag).toHaveAttribute('data-state', 'running');
  await expect(diag).toHaveAttribute('data-music-scene', 'street');
  await expect.poll(async () => Number(await diag.getAttribute('data-music-notes'))).toBeGreaterThan(8);
  await page.addStyleTag({ content: '.sound-debug { opacity: 0; pointer-events: none; }' });
  await page.locator('.tea-card').filter({ hasText: '老王' }).locator('.tea-card-main').click();
  await page.locator('.tea-card').filter({ hasText: '小李' }).locator('.tea-card-main').click();
  await page.evaluate(() => new Promise<void>(resolve => { let frames = 12; const tick = () => --frames ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }));
  await page.screenshot({ path: `${dir}/15-recruit-normal.png` });
  await page.getByRole('button', { name: '去奶茶店 →', exact: true }).click(); await expect(diag).toHaveAttribute('data-music-scene', 'prep');
  await page.evaluate(() => new Promise<void>(resolve => { let frames = 12; const tick = () => --frames ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }));
  await page.screenshot({ path: `${dir}/16-shop-normal.png` });
  await page.getByRole('button', { name: '声音设置', exact: true }).click();
  const music = page.getByTestId('music-volume'); await music.focus(); await page.keyboard.press('Home');
  await expect(diag).toHaveAttribute('data-music-volume', '0.00'); await expect(diag).toHaveAttribute('data-music-voices', '0');
  const zeroNotes = Number(await diag.getAttribute('data-music-notes')); const beforeClick = Number(await diag.getAttribute('data-played'));
  await page.getByRole('button', { name: '历史报告', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '声音设置' })).toHaveCount(0);
  await expect.poll(async () => Number(await diag.getAttribute('data-played'))).toBeGreaterThan(beforeClick);
  await page.waitForTimeout(650); expect(Number(await diag.getAttribute('data-music-notes'))).toBe(zeroNotes);
  await page.getByRole('button', { name: '声音设置', exact: true }).click(); await music.focus(); await page.keyboard.press('End');
  await expect(diag).toHaveAttribute('data-music-volume', '1.00');
  await expect.poll(async () => Number(await diag.getAttribute('data-music-notes'))).toBeGreaterThan(zeroNotes);
  const settings = page.getByRole('dialog', { name: '声音设置' }); await settings.getByTestId('btn-sound').click();
  await expect(diag).toHaveAttribute('data-voices', '0'); const mutedNotes = Number(await diag.getAttribute('data-music-notes'));
  await page.waitForTimeout(650); expect(Number(await diag.getAttribute('data-music-notes'))).toBe(mutedNotes);
  await settings.getByTestId('btn-sound').click(); await expect.poll(async () => Number(await diag.getAttribute('data-music-notes'))).toBeGreaterThan(mutedNotes);
  await page.reload(); await expect(page.locator('.tea-root')).toBeVisible();
  await expect(diag).toHaveAttribute('data-music-volume', '1.00'); await expect(diag).toHaveAttribute('data-state', 'locked');
  await page.addStyleTag({ content: '.sound-debug { opacity: 0; pointer-events: none; }' });
  await page.getByRole('button', { name: '去奶茶店 →', exact: true }).click(); await page.getByRole('button', { name: '免费试营业', exact: true }).click();
  await expect(diag).toHaveAttribute('data-music-scene', 'business'); await page.getByRole('button', { name: 'x2', exact: true }).click();
  await expect(diag).toHaveAttribute('data-music-scene', 'rush', { timeout: 20_000 });
  await expect.poll(async () => JSON.parse(await diag.getAttribute('data-cues') ?? '{}').tea_order ?? 0).toBeGreaterThan(0);
  await page.screenshot({ path: `${dir}/17-live-normal.png` });
  const beforeSkip = Number(await diag.getAttribute('data-played')); await page.getByRole('button', { name: /^跳过/ }).click();
  await expect(page.locator('.tea-report')).toBeVisible(); await expect(diag).toHaveAttribute('data-music-scene', 'report');
  await page.waitForTimeout(350); expect(Number(await diag.getAttribute('data-played')) - beforeSkip).toBeLessThan(8);
  await page.screenshot({ path: `${dir}/18-report-normal.png` });
  const data = await diag.evaluate(el => ({ ...((el as HTMLElement).dataset) }));
  expect(Number(data.voices)).toBeLessThanOrEqual(24); expect(Number(data.peak)).toBeGreaterThan(0.002); expect(Number(data.peak)).toBeLessThan(0.99);
  expect(errors).toEqual([]);
  writeFileSync(`${dir}/audio-acceptance.json`, JSON.stringify({ trustedGestureUnlock: true, musicOnlyMuteKeepsSfx: true,
    totalMuteStopsVoices: true, preferencesPersist: true, scenes: ['street', 'prep', 'business', 'rush', 'report'], skipDoesNotBurst: true, data, errors }, null, 2));
});
