import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { TeaSession, TeaLiveHome } from '../../shared/teaLive.ts';

const dir='artifacts/tea-town';mkdirSync(dir,{recursive:true});
async function headers(page:Page){return {authorization:`Bearer ${await page.evaluate(()=>sessionStorage.getItem('boss.session'))}`};}
async function home(page:Page):Promise<TeaLiveHome>{const r=await page.request.get('/api/tea/home',{headers:await headers(page)});expect(r.status()).toBe(200);return r.json();}
async function current(page:Page,id:string):Promise<TeaSession>{const r=await page.request.get(`/api/tea/sessions/${id}`,{headers:await headers(page)});expect(r.status()).toBe(200);return r.json();}
async function frame(page:Page){await page.evaluate(async()=>{for(let i=0;i<8;i++)await new Promise<void>(r=>requestAnimationFrame(()=>r()));});}
async function snap(page:Page,name:string){await frame(page);await page.screenshot({path:`${dir}/${name}.png`});}
async function phone(page:Page){await page.getByTestId('town-world').getByRole('button',{name:'手机',exact:true}).click();await expect(page.getByTestId('town-phone')).toBeVisible();}
async function enter(page:Page,id:string){await page.goto('/?lowfx=1');await page.getByTestId(`identity-${id}`).click();await page.getByTestId('enter-town').click();await expect(page.getByTestId('town-world')).toBeVisible();await expect(page.getByRole('button',{name:'手机',exact:true})).toBeEnabled();}
async function accept(page:Page){await phone(page);await expect(page.getByTestId('town-mission')).toHaveAttribute('data-status','offered');await page.getByTestId('town-accept-mission').click();await expect(page.getByTestId('town-mission')).toHaveAttribute('data-status','accepted');}
async function walkShop(page:Page){
 await page.getByTestId('town-go-shop').click();
 // Navigation must keep the player outdoors for the walk, never teleport into the shop.
 await expect(page.getByTestId('town-world')).toBeVisible();await expect(page.locator('.tea-prep')).toHaveCount(0);
 await expect(page.getByTestId('town-enter-shop')).toBeVisible({timeout:35_000});
 await page.getByTestId('town-enter-shop').click();await expect(page.locator('.tea-prep')).toBeVisible();
}
async function confirmStart(page:Page){const d=page.getByTestId('tea-open-confirm');await expect(d).toBeVisible();await d.getByTestId('tea-confirm-start').click();}
async function open(page:Page){
 const res=page.waitForResponse(r=>r.url().endsWith('/api/tea/sessions')&&r.request().method()==='POST');
 await page.getByRole('button',{name:/^正式开店/}).click();await confirmStart(page);
 const r=await res;expect(r.status()).toBe(200);return await r.json() as TeaSession;
}
async function finish(page:Page,s:TeaSession,normal=false){
 if(!normal)await page.getByRole('button',{name:'x2',exact:true}).click();
 while(s.status==='active'){
  s=await current(page,s.id);if(s.status==='finished')break;
  if(s.frame.selfTask.role==='idle'&&Math.max(s.frame.cashierQueue,s.frame.makerQueue)>0){
   const b=page.getByRole('button',{name:s.frame.makerQueue>=s.frame.cashierQueue?/^制作一批/:/^接待一批/});
   if(await b.isEnabled())await b.click();
  }
  await page.waitForTimeout(180);
 }
 await expect(page.locator('.tea-report')).toBeVisible();return s;
}
async function contained(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width??1440)+1);}

test('大地图救店：手机可暂缓→不招募独自赚钱→回地图查账→升级保存',async({page})=>{
 test.setTimeout(180_000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await enter(page,'wang');const before=await home(page);expect(before.mission.status).toBe('offered');
 await snap(page,'01-world-arrival');
 await phone(page);await page.getByRole('button',{name:'先逛逛',exact:true}).click();await expect(page.getByTestId('town-phone')).toHaveCount(0);
 await page.keyboard.press('KeyM');await frame(page);await snap(page,'02-big-map');await page.keyboard.press('KeyM');
 await page.keyboard.press('KeyP');await expect(page.getByTestId('town-phone')).toBeVisible();await page.keyboard.press('KeyP');await expect(page.getByTestId('town-phone')).toHaveCount(0);
 await accept(page);await snap(page,'03-phone-mission');await walkShop(page);await expect(page.locator('.tea-assign')).toHaveCount(1);await snap(page,'04-solo-prep');
 const opened=await open(page);expect(opened.run.workers).toHaveLength(1);expect(opened.run.plan.stock).toBe(20);expect(opened.run.settledAt).toBe(0);
 await page.getByRole('button',{name:'手机：任务与钱包',exact:true}).click(); await expect(page.getByTestId('town-phone')).toBeVisible();
 const phoneBefore=await current(page,opened.id);await page.waitForTimeout(700);expect((await current(page,opened.id)).t).toBe(phoneBefore.t);await page.getByRole('button',{name:'收起手机',exact:true}).click();
 // Leaving during a paid shift must pause the same service and preserve its prepaid cost.
 await page.getByTestId('town-exit-shop').click();await expect(page.getByTestId('town-world')).toBeVisible();
 const a=await current(page,opened.id);await page.waitForTimeout(700);const b=await current(page,opened.id);expect(b.t).toBe(a.t);
 await page.getByTestId('town-enter-shop').click();await expect(page.getByRole('button',{name:'继续',exact:true})).toBeVisible();await page.getByRole('button',{name:'继续',exact:true}).click();
 // A browser reload restores the same session rather than starting or charging a new one.
 await page.reload();await expect(page.locator('.tea-dock')).toBeVisible();await page.getByRole('button',{name:'继续',exact:true}).click();
 const ended=await finish(page,await current(page,opened.id),true);expect(ended.run.result.completed).toBeGreaterThanOrEqual(12);await snap(page,'05-solo-report');
 const after=await home(page);expect(after.mission.status).toBe('completed');expect(after.coins).toBe(before.coins+ended.run.result.profit+ended.run.result.bonus);expect(after.coins).toBeGreaterThan(before.coins);
 await page.getByRole('button',{name:'回小镇',exact:true}).click();await phone(page);await expect(page.getByTestId('town-mission')).toHaveAttribute('data-status','completed');
 await page.getByTestId('town-phone').getByRole('button',{name:'钱包',exact:true}).click();await expect(page.getByTestId('town-wallet')).toContainText('开店预付');await expect(page.getByTestId('town-wallet')).toContainText('营业收入');await snap(page,'06-wallet');
 await page.getByTestId('town-phone').getByRole('button',{name:'任务',exact:true}).click();await walkShop(page);
 await page.getByRole('button',{name:/^升级.*600/}).click();expect((await home(page)).shop.level).toBe(2);await expect(page.locator('.tea-ending')).toContainText('小店焕新');await expect(page.locator('.tea-ending')).not.toContainText('同事接管日常');await snap(page,'07a-rescue-upgrade');
 await page.getByTestId('town-exit-shop').click();await snap(page,'07-upgraded-town');await page.reload();await expect(page.getByTestId('town-world')).toBeVisible();expect((await home(page)).shop.level).toBe(2);
 await contained(page);expect(errors).toEqual([]);
 writeFileSync(`${dir}/ui-desktop.json`,JSON.stringify({solo:ended.run.result.completed,batches:ended.commands.length,net:ended.run.result.profit+ended.run.result.bonus,coinsBefore:before.coins,coinsAfter:after.coins,mission:after.mission,mapWalk:true,optionalRecruitment:true,leavePauses:true,reloadResumes:true,upgradePersists:true,errors},null,2));
});

test('手机自由动线：广场可选招募两人→步行奶茶小镇→同事自动赚金币',async({page})=>{
 test.setTimeout(150_000);await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await enter(page,'mei');await accept(page);
 await page.getByTestId('town-go-recruit').click();await expect(page.getByTestId('town-recruit')).toBeVisible({timeout:20_000});await page.getByTestId('town-recruit').click();
 await expect(page.getByRole('region',{name:'广场招募'})).toBeVisible();await snap(page,'08-mobile-recruit');
 for(const name of ['老王','小李'])await page.locator('.tea-card').filter({hasText:name}).locator('.tea-card-main').click();
 await page.getByRole('button',{name:'好了，回地图',exact:true}).click();await phone(page);await walkShop(page);await snap(page,'09-mobile-prep');await contained(page);
 const opened=await open(page);expect(opened.run.workers).toHaveLength(3);
 await page.getByRole('button',{name:'x2',exact:true}).click();
 await expect(page.locator('.tea-report')).toBeVisible({timeout:50_000});const ended=await current(page,opened.id);expect(ended.commands).toHaveLength(0);expect(ended.run.result.completed).toBe(20);await snap(page,'10-mobile-report');
 await page.getByRole('button',{name:'回小镇',exact:true}).click();await phone(page);await expect(page.getByTestId('town-mission')).toHaveAttribute('data-status','completed');await snap(page,'11-mobile-complete');await contained(page);expect(errors).toEqual([]);
 writeFileSync(`${dir}/ui-mobile.json`,JSON.stringify({workers:3,commands:0,completed:ended.run.result.completed,net:ended.run.result.profit+ended.run.result.bonus,phone:true,realWalk:true,errors},null,2));
});

test('正常画质：大地图→手机→步行入店，配乐随动线切换且静音可用',async({page})=>{
 test.setTimeout(90_000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?audio=debug');const diag=page.getByTestId('sound-diagnostics');await expect(diag).toHaveAttribute('data-state','locked');
 await page.getByTestId('identity-liu').click();await page.getByTestId('enter-town').click();await expect(page.getByTestId('town-world')).toBeVisible();await expect(diag).toHaveAttribute('data-music-scene','street');
 await expect.poll(async()=>Number(await diag.getAttribute('data-music-notes'))).toBeGreaterThan(8);
 await page.addStyleTag({content:'.sound-debug{opacity:0;pointer-events:none}'});
 await page.keyboard.press('KeyM');await page.waitForTimeout(1200);await snap(page,'12-normal-world-overview');await page.keyboard.press('KeyM');
 await accept(page);await walkShop(page);await expect(diag).toHaveAttribute('data-music-scene','prep');await snap(page,'13-normal-shop');
 await page.getByRole('button',{name:'声音设置',exact:true}).click();const music=page.getByTestId('music-volume');await music.focus();await page.keyboard.press('Home');await expect(diag).toHaveAttribute('data-music-volume','0.00');await expect(diag).toHaveAttribute('data-music-voices','0');
 await music.focus();await page.keyboard.press('End');await expect(diag).toHaveAttribute('data-music-volume','1.00');await page.getByRole('button',{name:'声音设置',exact:true}).click();
 const r=page.waitForResponse(r=>r.url().endsWith('/api/tea/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'免费试营业',exact:true}).click();await confirmStart(page);const s=await(await r).json() as TeaSession;
 await expect(diag).toHaveAttribute('data-music-scene','business');await page.getByRole('button',{name:'x2',exact:true}).click();await expect(diag).toHaveAttribute('data-music-scene','rush',{timeout:20_000});
 const beforeSkip=Number(await diag.getAttribute('data-played'));await page.getByRole('button',{name:/^跳过/}).click();await expect(page.locator('.tea-report')).toBeVisible();await expect(diag).toHaveAttribute('data-music-scene','report');expect(Number(await diag.getAttribute('data-played'))-beforeSkip).toBeLessThan(8);
 expect((await current(page,s.id)).run.mode).toBe('practice');expect((await home(page)).mission.status).toBe('accepted');await page.getByRole('button',{name:'回小镇',exact:true}).click();await expect(diag).toHaveAttribute('data-music-scene','street');
 await contained(page);expect(errors).toEqual([]);writeFileSync(`${dir}/audio.json`,JSON.stringify({scenes:['street','prep','business','rush','report','street'],musicMute:true,skipNoBurst:true,practiceCannotCompleteMission:true,errors},null,2));
});
