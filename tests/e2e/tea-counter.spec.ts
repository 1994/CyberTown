import {test,expect,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import type {TeaSession} from '../../shared/teaLive.ts';
import {prepareTrainedTownClones} from './town-test-fixtures.ts';
const dir='artifacts/tea-counter';mkdirSync(dir,{recursive:true});
async function login(page:Page){
 await page.goto('/?lowfx=1');await page.getByTestId('identity-wang').click();await page.getByTestId('enter-town').click();
 await expect(page.getByTestId('town-world')).toBeVisible();
 const guide=page.getByRole('button',{name:'查看手机消息',exact:true});
 if(await guide.isVisible())await guide.click();else await page.getByTestId('town-world').getByRole('button',{name:'手机',exact:true}).click();
 await page.getByTestId('town-accept-mission').click();await page.getByTestId('town-go-shop').click();
 await expect(page.getByTestId('town-enter-shop')).toBeVisible({timeout:35_000});await page.getByTestId('town-enter-shop').click();
 await expect(page.getByTestId('tea-counter')).toHaveAttribute('data-phase','prep');
}
async function open(page:Page){
 await page.getByRole('button',{name:/^正式开店/}).click();
 await expect(page.getByTestId('tea-open-confirm')).toBeVisible();
 const res=page.waitForResponse(r=>r.url().endsWith('/api/tea/sessions')&&r.request().method()==='POST');
 await page.getByTestId('tea-confirm-start').click();const response=await res;expect(response.status()).toBe(200);return response.json() as Promise<TeaSession>;
}
test.beforeEach(async({request})=>{expect((await request.post('/api/demo/reset')).ok()).toBeTruthy()});
test('solo player learns make then deliver, pauses and finishes real two-minute day',async({page})=>{
 test.setTimeout(240_000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page);await page.waitForTimeout(1800);await page.screenshot({path:`${dir}/01-prep.png`});
 await expect(page.getByTestId('counter-guide')).toContainText('角色自动跑位');
 const opened=await open(page);expect(opened.run.challenge.flow).toBe('counter.2');expect(opened.run.challenge.duration).toBe(120);
 let latest=opened;page.on('response',async r=>{if(r.url().includes(`/api/tea/sessions/${opened.id}/step`)&&r.status()===200){latest=await r.json()}});
 const start=Date.now();let sawReady=false,sawDelivery=false,snapped=false,paused=false;
 while(latest.status==='active'&&Date.now()-start<180_000){
  if(latest.t>12&&!paused){await page.getByRole('button',{name:'暂停营业',exact:true}).click();const before=latest.t;await page.waitForTimeout(1800);expect(latest.t).toBe(before);await page.getByRole('button',{name:'继续营业',exact:true}).click();paused=true}
  if(latest.frame.cashierQueue>0)sawReady=true;
  if(latest.frame.customersState.some(c=>c.state==='delivering'))sawDelivery=true;
  if(latest.frame.selfTask.role==='idle'){
   const role=latest.frame.cashierQueue>0?'cashier':'maker';const action=page.getByTestId(`counter-${role}`);
   if(await action.isEnabled())await action.click();
  }
  if(latest.t>35&&!snapped){await page.screenshot({path:`${dir}/02-service.png`});snapped=true}
  const understood=page.getByRole('button',{name:'完成引导',exact:true});if(await understood.isVisible())await understood.click();
  await page.waitForTimeout(280);
 }
 expect(latest.status).toBe('finished');expect(Date.now()-start).toBeGreaterThan(115_000);
 expect(latest.run.result.completed).toBeGreaterThanOrEqual(12);expect(sawReady&&sawDelivery).toBeTruthy();
 await expect(page.getByTestId('tea-report-dialog')).toContainText('营业日报');await page.screenshot({path:`${dir}/03-report.png`});
 expect(latest.run.result.selfMade).toBeGreaterThan(0);expect(latest.run.result.selfServed).toBeGreaterThan(0);
 await page.getByTestId('tea-report-prep').click();await expect(page.locator('.counter-title')).toContainText('第 2 天');
 await page.reload();await expect(page.getByTestId('tea-counter')).toBeVisible();await expect(page.locator('.counter-title')).toContainText('第 2 天');
 await expect(page.getByTestId('counter-guide')).toHaveCount(0);expect(errors).toEqual([]);
 writeFileSync(`${dir}/solo.json`,JSON.stringify({elapsed:Date.now()-start,run:latest.run,errors},null,2));
});
test('two trained staff cover both stations and mobile setup remains usable',async({page})=>{
 await login(page);await page.getByRole('button',{name:'回小镇',exact:true}).click();await prepareTrainedTownClones(page);await page.getByTestId('town-world').getByRole('button',{name:'手机',exact:true}).click();await page.getByTestId('town-go-shop').click();await expect(page.getByTestId('town-enter-shop')).toBeVisible({timeout:35000});await page.getByTestId('town-enter-shop').click();await expect(page.getByTestId('tea-counter')).toBeVisible();
 for(const id of ['demo-wang','demo-li'])await page.getByTestId(`tea-staff-${id}`).click();
 await page.getByLabel('老王的岗位').selectOption('maker');await page.getByLabel('小李的岗位').selectOption('cashier');
 await page.waitForTimeout(1500);await page.screenshot({path:`${dir}/06-staff-prep.png`});await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/^正式开店/}).scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/04-mobile-prep.png`});
 const opened=await open(page);await expect(page.getByTestId('counter-maker')).toBeVisible();await expect(page.getByTestId('counter-cashier')).toBeVisible();
 await page.waitForTimeout(12000);await page.screenshot({path:`${dir}/05-mobile-auto.png`});
 const token=await page.evaluate(()=>sessionStorage.getItem('boss.session'));const headers={authorization:`Bearer ${token}`};
 await page.getByRole('button',{name:'暂停营业',exact:true}).click();
 const response=await page.request.get(`/api/tea/sessions/${opened.id}`,{headers});const s:TeaSession=await response.json();expect(s.run.result.completed).toBeGreaterThan(0);expect(s.commands).toHaveLength(0);expect(s.frame.customersState.some(c=>c.seat===0)).toBeTruthy();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 writeFileSync(`${dir}/auto.json`,JSON.stringify({session:s},null,2));
});
