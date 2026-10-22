// Isolate later-store tests from the natural-time training test. This helper only
// advances only owned job timestamps in the isolated test DB; actual server
// settlement supplies XP, income and ledger together. No web/admin fixture API.
import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import type { TownHome } from '../../shared/town.ts';

export async function prepareTrainedTownClones(page: Page, ids = ['demo-wang', 'demo-li']) {
  const port = Number(new URL(page.url()).port);
  expect(port).not.toBe(8787);
  expect(port).not.toBe(8897);
  const manifest = JSON.parse(readFileSync(resolve(`.run/e2e-owned-${port}.json`), 'utf8')) as { port: number; pid: number; database: string; startedAt: number };
  expect(manifest.port).toBe(port);
  expect(Date.now()-manifest.startedAt).toBeLessThan(3600000);
  const db = realpathSync(manifest.database);
  expect(basename(db)).toBe('e2e.db');
  expect(dirname(db).startsWith(resolve(realpathSync(tmpdir()), 'boss-e2e-'))).toBe(true);
  const token = await page.evaluate(() => sessionStorage.getItem('boss.session'));
  const headers = { authorization: `Bearer ${token}` };
  let h = await (await page.request.get('/api/tea/town', { headers })).json() as TownHome;
  for (const id of ids) {
    const candidate = h.candidates.find(c => c.id === id)!;
    expect(candidate).toBeTruthy();
    const res = await page.request.post('/api/tea/town/hire', { headers, data: { sourceId: id, expectedPrice: candidate.price } });
    expect(res.status()).toBe(200);
    h = await res.json() as TownHome;
  }
  for (const cloneId of ids) {
    const res = await page.request.post('/api/tea/town/jobs', { headers, data: { cloneId, kind: 'clean' } });
    expect(res.status()).toBe(200);
  }
  execFileSync('python3', ['-c', "import sqlite3,sys,json; c=sqlite3.connect(sys.argv[1]); c.executemany(\"UPDATE town_jobs SET started_at=started_at-180000,ends_at=ends_at-180000 WHERE owner_id=? AND source_id=? AND status='active'\",[(sys.argv[2],s) for s in json.loads(sys.argv[3])]); c.commit(); c.close()", db, h.owner.id, JSON.stringify(ids)]);
  const settled = await page.request.get('/api/tea/town', { headers });
  expect(settled.status()).toBe(200);
  for (const cloneId of ids) {
    const res = await page.request.post('/api/tea/town/jobs', { headers, data: { cloneId, kind: 'rest' } });
    expect(res.status()).toBe(200);
  }
  await page.reload();
  await expect(page.getByTestId('town-world')).toBeVisible({ timeout: 30000 });
  if (await page.getByTestId('town-arrival-dismiss').isVisible().catch(() => false)) await page.getByTestId('town-arrival-dismiss').click();
}
