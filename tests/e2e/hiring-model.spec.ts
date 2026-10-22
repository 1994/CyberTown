import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { TownHome } from '../../shared/town.ts';

const dir = 'artifacts/hiring-model';
mkdirSync(dir, { recursive: true });
test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset')).ok()).toBe(true);
});
async function auth(page: Page) {
  return { authorization: `Bearer ${await page.evaluate(() => sessionStorage.getItem('boss.session'))}` };
}
async function home(page: Page): Promise<TownHome> {
  const response = await page.request.get('/api/tea/town', { headers: await auth(page) });
  expect(response.status()).toBe(200); return response.json();
}
async function enter(page: Page, id: string) {
  await page.goto('/?lowfx=1');
  await page.getByTestId(`identity-${id}`).click();
  await page.getByTestId('enter-town').click();
  await expect(page.getByTestId('town-world')).toBeVisible();
  if (await page.getByTestId('town-arrival-dismiss').count()) await page.getByTestId('town-arrival-dismiss').click();
}
async function hall(page: Page, tab: 'candidates' | 'staff' | 'market') {
  await page.getByTestId('town-phone-trigger').click();
  await page.getByTestId('town-open-hall').click();
  await expect(page.getByTestId('hiring-hall')).toBeVisible();
  await page.locator(`[data-testid="hiring-tab"][data-tab="${tab}"]`).click();
}
async function fit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const close = await page.getByTestId('hiring-close').boundingBox();
  expect(close).not.toBeNull(); const vp = page.viewportSize()!;
  expect(close!.x).toBeGreaterThanOrEqual(0); expect(close!.y).toBeGreaterThanOrEqual(0);
  expect(close!.x + close!.width).toBeLessThanOrEqual(vp.width + 1);
  expect(close!.y + close!.height).toBeLessThanOrEqual(vp.height + 1);
}

test('自然培养与合同流转：真实签约、自动杂活、召回、撤单、跨镇成交', async ({ browser, baseURL }) => {
  test.setTimeout(200_000);
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  let page = await context.newPage(); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await enter(page, 'wang');
  const initial = await home(page); expect(initial.clones).toHaveLength(0);
  const sellerHeaders = await auth(page);
  await hall(page, 'candidates'); await fit(page);
  await page.getByTestId('hire-candidate-system-a').click();
  await page.screenshot({ animations: 'disabled', path: `${dir}/01-candidate.png` });
  await page.getByTestId('hire-open-confirm').click();
  await expect(page.getByTestId('hire-confirm')).not.toContainText('永久');
  await page.getByTestId('hire-confirm').getByRole('button', { name: '再想想', exact: true }).click();
  expect((await home(page)).coins).toBe(initial.coins);
  await page.getByTestId('hire-open-confirm').click();
  await page.getByTestId('hire-confirm-submit').click();
  const employee = page.getByTestId('hired-clone-system-a');
  await expect(employee).toHaveAttribute('data-level', '1');
  await expect(employee.getByTestId('clone-job-manage')).toBeDisabled();
  expect((await home(page)).coins).toBe(initial.coins-120);
  await employee.getByTestId('clone-job-clean').click();
  await expect(employee).toHaveAttribute('data-job', 'clean');
  await page.screenshot({ animations: 'disabled', path: `${dir}/02-auto-work.png` });
  // Actual wall time and server settlement; no XP fixture and no simulated clock.
  await expect(employee).toHaveAttribute('data-level', '2', { timeout: 75_000 });
  const grown = await home(page);
  expect(grown.clones[0].xp).toBeGreaterThanOrEqual(60);
  expect(grown.coins).toBeGreaterThanOrEqual(initial.coins-120+36);
  await employee.getByTestId('clone-job-rest').click();
  await expect(employee).toHaveAttribute('data-job', 'rest');
  const recalled = await home(page); expect(recalled.clones[0].canStaff).toBe(true);
  await page.screenshot({ animations: 'disabled', path: `${dir}/03-grown-staff.png` });
  await page.getByTestId('clone-list-system-a').click();
  await page.getByTestId('market-price').fill('250');
  await page.getByTestId('market-list-submit').click();
  let listed = await home(page); const first = listed.market.find(l => l.sourceId==='system-a')!;
  expect(first).toBeTruthy(); expect(first.proceeds).toBe(237);
  await page.locator('[data-testid="hiring-tab"][data-tab="market"]').click();
  await page.getByTestId(`market-withdraw-${first.listingId}`).click();
  await expect.poll(async () => (await home(page)).market.length).toBe(0);
  await page.locator('[data-testid="hiring-tab"][data-tab="staff"]').click();
  await page.getByTestId('clone-list-system-a').click();
  await page.getByTestId('market-price').fill('250');
  await page.getByTestId('market-list-submit').click();
  listed=await home(page); const listing=listed.market.find(l=>l.sourceId==='system-a')!;
  await page.locator('[data-testid="hiring-tab"][data-tab="market"]').click();
  await page.screenshot({ animations: 'disabled', path: `${dir}/04-seller-market.png` });
  await page.close();
  page=await context.newPage(); page.on('pageerror', e=>errors.push(e.message));
  await enter(page, 'liu'); const buyerBefore=await home(page);
  await hall(page, 'market');
  await page.getByTestId(`market-buy-${listing.listingId}`).click();
  await page.screenshot({ animations: 'disabled', path: `${dir}/05-buy-confirm.png` });
  await page.getByTestId('market-buy-submit').click();
  await expect.poll(async ()=>(await home(page)).clones.length).toBe(1);
  const bought=await home(page);
  expect(bought.coins).toBe(buyerBefore.coins-250);
  expect(bought.clones[0].xp).toBe(listing.xp); expect(bought.clones[0].level).toBe(2);
  const sellerResponse=await page.request.get('/api/tea/town',{headers:sellerHeaders});
  expect(sellerResponse.status()).toBe(200); const seller=await sellerResponse.json() as TownHome;
  expect(seller.clones).toHaveLength(0); expect(seller.coins).toBe(listed.coins+237);
  expect(seller.earned).toBe(listed.earned);
  await page.locator('[data-testid="hiring-tab"][data-tab="market"]').click();
  await expect(page.getByTestId(`market-trade-${listing.listingId}`)).toHaveAttribute('data-status','sold');
  await page.screenshot({animations:'disabled',path:`${dir}/06-buyer-history.png`});
  await page.reload(); await expect(page.getByTestId('town-world')).toBeVisible();
  expect((await home(page)).clones[0].xp).toBe(listing.xp);
  await page.getByTestId('town-phone-trigger').click();
  await page.getByTestId('town-accept-mission').click();
  await page.getByTestId('town-go-shop').click();
  await expect(page.getByTestId('town-enter-shop')).toBeVisible({timeout:35000});
  await page.getByTestId('town-enter-shop').click();
  await expect(page.getByTestId('tea-staff-system-a')).toBeVisible();
  await page.getByTestId('tea-staff-system-a').click();
  await expect(page.getByTestId('tea-staff-system-a')).toHaveAttribute('aria-pressed','true');
  await page.screenshot({animations:'disabled',path:`${dir}/07-transferred-store-staff.png`});
  expect(errors).toEqual([]);
  writeFileSync(`${dir}/natural-transfer.json`,JSON.stringify({naturalTraining:true,hire:120,price:250,fee:13,proceeds:237,xp:listing.xp,buyerCoins:bought.coins,sellerCoins:seller.coins,earnedPreserved:seller.earned,canStaffAfterTransfer:true,errors},null,2));
  await context.close();
});

test('雇佣大厅触屏：竖横屏可选人、取消确认、切换员工与市场', async ({ browser, baseURL }) => {
  for (const viewport of [{width:390,height:844},{width:844,height:390}]) {
    const context=await browser.newContext({baseURL,viewport,isMobile:true,hasTouch:true});
    const page=await context.newPage(); const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await enter(page,'mei');const before=await home(page);await hall(page,'candidates');await fit(page);
    await page.getByTestId('hire-candidate-system-a').click();
    await page.getByTestId('hire-open-confirm').scrollIntoViewIfNeeded();
    await page.screenshot({animations:'disabled',path:`${dir}/touch-${viewport.width}-detail.png`});
    await page.getByTestId('hire-open-confirm').click();
    await page.getByTestId('hire-confirm-submit').scrollIntoViewIfNeeded();
    await page.screenshot({animations:'disabled',path:`${dir}/touch-${viewport.width}-confirm.png`});
    await page.getByTestId('hire-confirm').getByRole('button',{name:'再想想',exact:true}).click();
    await page.locator('[data-testid="hiring-tab"][data-tab="staff"]').click();await fit(page);
    await page.locator('[data-testid="hiring-tab"][data-tab="market"]').click();await fit(page);
    await page.screenshot({animations:'disabled',path:`${dir}/touch-${viewport.width}-market.png`});
    await page.getByTestId('hiring-close').click();
    expect((await home(page)).coins).toBe(before.coins);expect(errors).toEqual([]);await context.close();
  }
});
