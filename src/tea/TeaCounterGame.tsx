import { useEffect, useState } from 'react';
import { ArrowLeft, CupSoda, HandPlatter, Pause, Play, Users, Coins, HelpCircle, Check, Package, ChevronRight, Smartphone } from 'lucide-react';
import type { TeaRole } from '../../shared/tea.ts';
import type { TeaWorkRole } from '../../shared/teaLive.ts';
import type { TeaChapterController } from './useTeaChapter.ts';
import { TeaCounterScene, type CounterView } from './TeaCounterScene.tsx';
import { OpenConfirm, ReportDialog } from './TeaDialogs.tsx';
import { Face } from './HiringHall.tsx';
import { useGame } from '../store.ts';
import { useTownState } from './townState.ts';
import type { TeaWorker } from '../../shared/tea.ts';
import { GameSettings } from '../ui/GameSettings.tsx';
import './counter.css';
import { workSteps } from './counterFeedback.ts';
import { useTouchUi } from '../ui/useTouchUi.ts';

const time = (n:number) => `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
const roleName = (r:string) => r === 'maker' ? '制作' : r === 'cashier' ? '端送' : '忙时补位';
export function TeaCounterGame({controller:c,onExit,onPhone,onHall}:{controller:TeaChapterController;onExit:()=>void;onPhone:()=>void;onHall:()=>void}) {
 const [confirm,setConfirm]=useState<'practice'|'official'|null>(null);
 const [help,setHelp]=useState(false);
 const [cameraView,setCameraView]=useState<CounterView>('overview');
 const touch=useTouchUi();
 const me=useGame(s=>s.snapshot?.me);
 const clones=useTownState(s=>s.home?.clones);
 const displayWorker=(w:TeaWorker)=>{const clone=clones?.find(x=>x.id===w.id);return {...w,avatarUrl:clone?.avatarUrl??w.avatarUrl,level:clone?.level??w.level};};
 const home=c.home;
 const view=c.view==='ending'||c.view==='street'?'prep':c.view;
 const playing=view==='play';
 const report=view==='report'&&!!c.run;
 const modal=!!confirm||report;
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if(modal||e.repeat||e.ctrlKey||e.metaKey||e.altKey||(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]'))return;
   if(e.key.toLowerCase()==='v'){e.preventDefault();setCameraView(v=>v==='overview'?'front':v==='front'?'top':'overview');}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[modal]);
 const currentRun=view==='prep'?null:c.run;
 const frame=playing?c.frame:null;
 const team=(currentRun?.workers??c.team).map(displayWorker);
 const roles=currentRun?Object.fromEntries(currentRun.plan.assignments.map(a=>[a.workerId,a.role])):c.roles;
 const ready=frame?.cashierQueue??0,orders=frame?.makerQueue??0;
 const can=(r:TeaWorkRole)=>playing&&!c.paused&&!modal&&!c.frame?.selfTask.queuedRole&&c.frame?.selfTask.role!==r&&(r==='maker'?orders>0:ready>0);
 const assign=(r:TeaWorkRole)=>{if(can(r))void c.assign(r)};
 useEffect(()=>{
  if(!playing||modal)return;
  const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea,select')||e.repeat)return;
   if(e.key==='1'){e.preventDefault();assign('maker')}if(e.key==='2'){e.preventDefault();assign('cashier')}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 });
 if(!home)return <div className="counter-root counter-loading"><p>{c.error||'正在打开奶茶店…'}</p>{c.error&&<button onClick={()=>void c.load()}>重新连接</button>}<button onClick={onExit}>回小镇</button></div>;
 const baseChallenge=home.business?.challenge??home.challenge;
 const ch=currentRun?.challenge??{...baseChallenge,duration:c.duration};
 const staff=team.filter(w=>w.id!=='self');
 const cover=(r:TeaRole)=>staff.filter(w=>roles[w.id]===r||roles[w.id]==='support');
 const fullyAuto=staff.some(w=>roles[w.id]==='maker')&&staff.some(w=>roles[w.id]==='cashier');
 const selfTask=frame?.selfTask;
 const taskActive=!!selfTask&&selfTask.role!=='idle';
 const phase=!playing?'准备开店':(frame?.t??0)>=ch.duration-Math.min(10,ch.duration/4)?'收尾中':'营业中';
 const made=(currentRun?.result.selfMade??0)+(frame?.customersState.filter(x=>['ready','delivering','served'].includes(x.state)).length??0),served=frame?.served??0;
 const recommended = !c.paused && !selfTask?.queuedRole ? ready>0 && selfTask?.role!=='cashier' ? 'cashier' : !taskActive && orders>0 ? 'maker' : null : null;
 const hint=c.paused?'已暂停 · 点继续恢复营业':selfTask?.queuedRole?`已安排${roleName(selfTask.queuedRole)} · 当前这批完成后自动换岗`
   :recommended==='cashier'?'杯子好了 → 点「端送」收钱'
   :taskActive?`${roleName(selfTask.role)}中 · 自动完成，无需连点`
   :recommended==='maker'?'有新订单 → 点「制作」'
   :fullyAuto?'员工自动营业 · 你可随时帮忙':'等待顾客下单';
 const crew=staff.length>0&&<div className="counter-onshift" aria-label="本班员工">{staff.map(w=><div key={w.id}><Face w={w} size={30}/><span><b>{w.name}</b><small>{w.level?`Lv.${w.level} · `:''}{roleName(roles[w.id]??'support')} · {playing?(c.paused?'已暂停':'自动工作'):'已排班'}</small></span></div>)}</div>;
 const tutorialStep=served>0?3:made>0?2:1;
 const occupants=frame?.customersState.filter(x=>!['served','lost','pending'].includes(x.state)).length??0;
 const waiting=frame?.customersState.filter(x=>x.state==='waiting').length??0;
 const finishGuide=()=>{setHelp(false);void c.dismissGuide()};
 return <main className={`counter-root ${view==='prep'?'counter-planning':`counter-${view}`}`} data-testid="tea-counter" data-phase={view}>
  <header className="counter-header" inert={modal}>
   <button className="counter-back" onClick={onExit}><ArrowLeft size={17}/>回小镇</button>
   <div className="counter-title"><small>第 {ch.businessDay??home.counter?.day??1} 天 · {phase}</small><h1>{home.shop.level===1?'街角奶茶':home.shop.level===2?'霓虹奶茶':'夜城茶饮'}</h1></div>
   <div className="counter-tools"><button onClick={onPhone} aria-label="查看钱包"><Coins size={17}/>{home.wallet.balance}</button><button className="counter-phone" onClick={onPhone} aria-label="手机：任务与钱包" data-testid="counter-phone-trigger"><Smartphone size={18}/><span>手机</span></button><button onClick={()=>setHelp(!help)} aria-label="怎么玩"><HelpCircle size={19}/></button><GameSettings/></div>
  </header>
  {playing&&<div className="counter-status" inert={modal}>
   <span className={`counter-clock ${c.paused?'is-paused':''}`}><i className="counter-dot"/><b>{time(Math.max(0,ch.duration-(frame?.t??0)))}</b><small>{c.paused?'已暂停':'剩余'}</small></span>
   <span className="counter-goal"><span><b data-testid="counter-served">{frame?.served??0}</b><small>/ {ch.target} 杯</small></span><i aria-hidden="true"><i style={{width:`${Math.min(100,((frame?.served??0)/Math.max(1,ch.target))*100)}%`}}/></i></span>
   <span className="counter-revenue"><Coins size={15} aria-hidden="true"/><b>{currentRun?.result.revenue??0}</b><small>收入</small></span>
   <span className={`counter-lost ${(frame?.lost??0)>0?'counter-warning':''}`}><b>{frame?.lost??0}</b><small>流失</small></span>
   <button className="counter-pause" onClick={c.togglePause} aria-label={c.paused?'继续营业':'暂停营业'}>{c.paused?<Play size={16}/>:<Pause size={16}/>}<span>{c.paused?'继续':'暂停'}</span></button>
  </div>}
  <section className="counter-scene" aria-label="奶茶店：左边制作台，右边取餐台，前方客人座位" inert={modal}>
   <TeaCounterScene cameraView={cameraView} level={home.shop.level} team={team} roles={roles} frame={frame} liveFrame={frame} stockMax={currentRun?.plan.stock??c.stock} events={c.events} supportAt={c.supportAt} selfAvatar={me?.avatarUrl} selfId="self" live={playing&&!c.paused} canAssign={playing&&!c.paused&&!modal&&!selfTask?.queuedRole} onAssign={assign}/>
   <nav className="counter-camera" aria-label="店内视角">{([['overview','全景'],['front','正面'],['top','俯瞰']] as const).map(([id,label])=><button key={id} onClick={()=>setCameraView(id)} aria-pressed={cameraView===id}>{label}</button>)}{!touch&&<kbd>V</kbd>}</nav>
   {playing&&frame&&<div className="counter-mobile-progress" aria-label="岗位进度">
    {(['maker','cashier'] as const).map(role=>{
     const workers=frame.workersState.filter(w=>w.role===role&&w.customerId!=null);
     const worker=workers.find(w=>w.id==='self')??workers[0];
     return <section key={role} className={`station-${role}`}><header><b>{roleName(role)}</b><span>{worker?`${Math.round(worker.progress*100)}%`:role==='maker'?`${orders} 单待做`:`${ready} 杯待送`}</span></header>
      <ol>{workSteps(role,worker?.progress??0).map((step,i)=><li key={step.label} className={step.progress>=1?'done':step.progress>0?'active':''}><progress aria-label={`${roleName(role)}：${step.label}`} max={1} value={step.progress}/><span>{step.progress>=1?'✓':i+1} {step.label}</span></li>)}</ol>
     </section>;
    })}
   </div>}
   <div className="counter-legend" aria-label="人物标识"><span className="legend-self">◆ 你</span><span className="legend-staff">▰ 员工</span><span className="legend-guest">● 顾客 NPC</span></div>
   {playing&&help&&<div className="counter-orders" aria-label="当前订单" data-testid="counter-orders">
    <div><b>订单</b><span>{orders} 待做 · {ready} 待送</span></div>
    <ul>{frame?.customersState.filter(x=>['maker','making','ready','delivering'].includes(x.state)).slice(0,6).map(x=><li key={x.id} className={`order-${x.state}`}>
     <b>#{x.id}</b><span>{x.state==='maker'?'待制作':x.state==='making'?'制作中':x.state==='ready'?'可端送':'端送中'}</span><i style={{width:`${Math.max(8,(x.patience??1)*100)}%`}}/>
    </li>)}</ul>
   </div>}
  </section>
  {view==='prep'&&<aside className="counter-prep tea-prep" inert={modal}>
   <div className="counter-section-title"><h2>备料开店</h2><p><span>营业 {ch.duration === 30 ? '30 秒' : '1 分钟'}</span><span>目标 {ch.target} 杯</span></p></div>
   {help&&<p className="counter-prep-help">选好备料后开店；营业时点制作、端送，员工自动工作。</p>}
   <div className="counter-recipe"><span className="counter-recipe-icon"><CupSoda size={24}/></span><b>招牌珍珠奶茶</b><strong>{ch.price}<small>金币 / 杯</small></strong></div>
   <div className="counter-duration" role="group" aria-label="营业时长"><h3>营业时长</h3><div>{([30,60] as const).map(n=><button key={n} type="button" aria-pressed={c.duration===n} onClick={()=>c.setDuration(n)}><b>{n===30?'30 秒':'1 分钟'}</b>{n===30&&<small>快速营业</small>}</button>)}</div></div>
   <div className="counter-stock"><h3><Package size={16}/>备料</h3><div>{(home.business?.stockOptions??[20,40,60]).map(n=><button key={n} aria-pressed={c.stock===n} onClick={()=>c.setStock(n as typeof c.stock)}><b>{n}</b><span>份</span>{n===home.business?.recommendedStock&&<small>推荐</small>}<em>原料 {n*ch.materialCost}</em></button>)}</div></div>
   {crew}
   <details className="counter-staff-settings"><summary>员工安排 <span>{staff.length ? `${staff.length} 人上岗` : c.pool.length ? `${c.pool.length} 人待安排 · 点击展开` : '亲自经营'}</span></summary>
   <div className="counter-positions">
    {(['maker','cashier'] as const).map(r=><div key={r}><span>{r==='maker'?<CupSoda size={20}/>:<HandPlatter size={20}/>}<b>{roleName(r)}岗</b></span><strong>{cover(r).length?cover(r).map(w=>w.name).join('、'):'你亲自来'}</strong><small>{cover(r).length?'自动':`熟练 Lv.${1+Math.min(5,Math.floor((r==='maker'?(home.counter?.makerXp??0):(home.counter?.serviceXp??0))/10))}`}</small></div>)}
   </div>
   <section className="counter-crew"><header><h3><Users size={16}/>安排员工 <small>最多 2 人</small></h3><button onClick={onHall}>雇佣大厅<ChevronRight size={14}/></button></header>
    {c.pool.length?<div className="counter-crew-list">{c.pool.map(raw=>{const w=displayWorker(raw);const on=c.team.some(x=>x.id===w.id);return <div className={on?'selected':''} key={w.id}>
     <button data-testid={`tea-staff-${w.id}`} aria-pressed={on} onClick={()=>c.pick(w.id)}><Face w={w} size={32}/><span><b>{w.name}</b><small>{w.level?`Lv.${w.level} · `:''}{w.salary} 金币 / 班</small></span>{on&&<Check size={16}/>}</button>
     {on&&<select aria-label={`${w.name}的岗位`} value={c.roles[w.id]??'maker'} onChange={e=>c.setRole(w.id,e.target.value as TeaRole)}><option value="maker">制作</option><option value="cashier">端送</option><option value="support">忙时补位</option></select>}
    </div>})}</div>:<p className="counter-empty">暂无员工 · 可直接亲自营业</p>}
   </section>
   </details>
   <div className="counter-prep-foot">
   <div className="counter-budget"><span>预付成本 <strong>{c.totalCost}</strong></span><small>原料 {c.stock*ch.materialCost} + 工资 {staff.reduce((n,w)=>n+w.salary,0)} + 运营 {ch.operatingCost}</small></div>
   {c.problems.map(p=><p className="counter-warning" key={p}>{p}</p>)}
   {home.mission.status==='offered'&&<button className="tea-btn" data-testid="town-accept-mission" disabled={c.busy} onClick={()=>void c.acceptMission()}>接下手机里的救店任务</button>}
   <button className="tea-btn primary counter-open" disabled={c.busy||c.problems.length>0||home.wallet.balance<c.totalCost} onClick={()=>setConfirm('official')}>正式开店 <ArrowLeft className="counter-arrow" size={18}/></button>
   <button className="counter-practice" disabled={c.busy||c.problems.length>0} onClick={()=>setConfirm('practice')}>免费试营业</button>
   </div>
   {home.business?.upgradeReady&&home.shop.level<3&&<button className="counter-upgrade" disabled={c.busy||home.wallet.balance<home.shop.nextUpgradeCost} onClick={()=>void c.upgrade()}>升级门店 · {home.shop.nextUpgradeCost} 金币</button>}
  </aside>}
  {playing&&<footer className="counter-dock" inert={modal}>
   {crew}
   {help&&<section className="counter-coach" data-testid="counter-guide" aria-label="第一杯引导">
    <header><b>{fullyAuto?'员工已接手':`第一杯 · ${tutorialStep}/3`}</b><button onClick={finishGuide}>{served>0?'完成引导':'跳过'}</button></header>
    <div className="counter-coach-steps"><span className={tutorialStep===1?'current':made>0?'done':''}>① 制作</span><ChevronRight size={12}/><span className={tutorialStep===2?'current':served>0?'done':''}>② 端送</span><ChevronRight size={12}/><span className={tutorialStep===3?'current':''}>③ 收钱</span></div>
    <small>{served>0?'首杯已收款！继续营业，结束后查看日报':fullyAuto?'制作、端送都由员工自动完成':touch?'轻点下方按钮 · 角色自动走位，每批最多 3 杯':'点击按钮或按 1 / 2 · 角色自动走位，每批最多 3 杯'}</small>
   </section>}
   <div className="counter-hint" role="status" data-testid="counter-next-action">{hint}{!home.counter?.guideSeen&&<button className="counter-guide-dismiss" onClick={finishGuide}>{served>0?'完成引导':'跳过引导'}</button>}</div>
   <div className="counter-action-row">
    {(['maker','cashier'] as const).map(r=><button key={r} data-testid={`counter-${r}`} className={`counter-action action-${r} ${recommended===r?'needs-you':''}`} disabled={!can(r)} onClick={()=>assign(r)}>
     <i className="counter-action-icon">{r==='maker'?<CupSoda size={24}/>:<HandPlatter size={24}/>}</i><span><b>{r==='maker'?'制作':'端送'}{recommended===r&&<em className="counter-tap">{touch?'点这里':'下一步'}</em>}</b><small>{cover(r).length?'员工自动 · 可帮忙':r==='maker'?'待做订单':'待送杯数'}</small></span><strong className="counter-action-count">{r==='maker'?orders:ready}<small>{r==='maker'?'单':'杯'}</small></strong>{!touch&&<kbd>{r==='maker'?'1':'2'}</kbd>}
    </button>)}
   </div>
   <div className="counter-jobline"><span data-testid="counter-occupancy">店内 {occupants-waiting}/8 · 等位 {waiting}/2</span><span aria-label={`剩余原料 ${Math.floor(frame?.stock??0)}份`} title="剩余原料"><Package size={13} aria-hidden="true"/>{Math.floor(frame?.stock??0)}</span></div>
  </footer>}
  {c.toast&&<div className="counter-toast" role="status">{c.toast}</div>}
  {confirm&&view==='prep'&&<OpenConfirm mode={confirm} challenge={ch} team={team} roles={roles} stock={c.stock} strategy={c.strategy} cost={{material:c.stock*ch.materialCost,wages:staff.reduce((n,w)=>n+w.salary,0),operating:ch.operatingCost,total:c.totalCost}} balance={home.wallet.balance} busy={c.busy} blocked={c.problems[0]??(confirm==='official'&&home.wallet.balance<c.totalCost?'金币不足':'')} onCancel={()=>setConfirm(null)} onStart={()=>void c.start(confirm).then(()=>setConfirm(null))}/>}
  {report&&c.run&&<ReportDialog run={c.run} home={home} busy={c.busy} bonusFor={home.mission.runId===c.run.id} canUpgrade={!!home.business?.upgradeReady&&home.shop.level<3} nextGoal={home.business?.goal??''} onUpgrade={()=>void c.upgrade()} onPrep={c.next} onExit={onExit}/>}
 </main>;
}
