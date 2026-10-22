import { useEffect, useState } from 'react';
import { ArrowLeft, CupSoda, HandPlatter, Pause, Play, Users, Coins, HelpCircle, Check, Package, ChevronRight } from 'lucide-react';
import type { TeaRole } from '../../shared/tea.ts';
import type { TeaWorkRole } from '../../shared/teaLive.ts';
import type { TeaChapterController } from './useTeaChapter.ts';
import { TeaCounterScene } from './TeaCounterScene.tsx';
import { OpenConfirm, ReportDialog } from './TeaDialogs.tsx';
import { Face } from './HiringHall.tsx';
import { useGame } from '../store.ts';
import { SoundMenu } from '../ui/SoundControl.tsx';
import './counter.css';

const time = (n:number) => `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
const roleName = (r:string) => r === 'maker' ? '制作' : r === 'cashier' ? '端送' : '忙时补位';
export function TeaCounterGame({controller:c,onExit,onPhone,onHall}:{controller:TeaChapterController;onExit:()=>void;onPhone:()=>void;onHall:()=>void}) {
 const [confirm,setConfirm]=useState<'practice'|'official'|null>(null);
 const [help,setHelp]=useState(false);
 const me=useGame(s=>s.snapshot?.me);
 const home=c.home;
 const view=c.view==='ending'||c.view==='street'?'prep':c.view;
 const playing=view==='play';
 const report=view==='report'&&!!c.run;
 const modal=!!confirm||report;
 const currentRun=view==='prep'?null:c.run;
 const frame=playing?c.frame:null;
 const team=currentRun?.workers??c.team;
 const roles=currentRun?Object.fromEntries(currentRun.plan.assignments.map(a=>[a.workerId,a.role])):c.roles;
 const ready=frame?.cashierQueue??0,orders=frame?.makerQueue??0;
 const can=(r:TeaWorkRole)=>playing&&!c.paused&&!modal&&!c.frame?.selfTask.queuedRole&&(r==='maker'?orders>0:ready>0);
 const assign=(r:TeaWorkRole)=>{if(can(r))void c.assign(r)};
 useEffect(()=>{
  if(!playing||modal)return;
  const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea,select')||e.repeat)return;
   if(e.key==='1'){e.preventDefault();assign('maker')}if(e.key==='2'){e.preventDefault();assign('cashier')}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 });
 if(!home)return <div className="counter-root counter-loading"><p>{c.error||'正在打开奶茶店…'}</p>{c.error&&<button onClick={()=>void c.load()}>重新连接</button>}<button onClick={onExit}>回小镇</button></div>;
 const ch=currentRun?.challenge??home.business?.challenge??home.challenge;
 const staff=team.filter(w=>w.id!=='self');
 const cover=(r:TeaRole)=>staff.filter(w=>roles[w.id]===r||roles[w.id]==='support');
 const fullyAuto=staff.some(w=>roles[w.id]==='maker')&&staff.some(w=>roles[w.id]==='cashier');
 const selfTask=frame?.selfTask;
 const taskActive=!!selfTask&&selfTask.role!=='idle';
 const phase=!playing?'准备开店':(frame?.t??0)>=ch.duration-30?'最后订单 · 收尾中':'营业中';
 const guide=!home.counter?.guideSeen||help;
 const made=currentRun?.result.selfMade??0,served=currentRun?.result.selfServed??0;
 const hint=c.paused?'营业已暂停，顾客会等你回来':taskActive?`你正在${roleName(selfTask.role)} · 自动完成这批，最多 3 杯`
   :ready>0&&!cover('cashier').length?'饮品做好了，点右下「端送饮品」送到客人手里'
   :orders>0&&!cover('maker').length?'客人已下单，点左下「制作饮品」开始出杯'
   :fullyAuto?'两位员工正在自动营业，你可以看着，也可以帮忙'
   :orders+ready===0?'客人正在进店，下单后会出现在订单栏':'员工正在处理订单，你可以帮忙加快速度';
 const finishGuide=()=>{setHelp(false);void c.dismissGuide()};
 return <main className={`counter-root ${view==='prep'?'counter-planning':`counter-${view}`}`} data-testid="tea-counter" data-phase={view}>
  <header className="counter-header" inert={modal}>
   <button className="counter-back" onClick={onExit}><ArrowLeft size={17}/>回小镇</button>
   <div className="counter-title"><small>第 {ch.businessDay??home.counter?.day??1} 天 · {phase}</small><h1>{home.shop.level===1?'街角奶茶':home.shop.level===2?'霓虹奶茶':'夜城茶饮'}</h1></div>
   <div className="counter-tools"><button onClick={onPhone} aria-label="查看钱包"><Coins size={17}/>{home.wallet.balance}</button><button onClick={()=>setHelp(!help)} aria-label="怎么玩"><HelpCircle size={19}/></button><SoundMenu/></div>
  </header>
  {playing&&<div className="counter-status" inert={modal}>
   <span><i className="counter-dot"/>{time(Math.max(0,ch.duration-(frame?.t??0)))}<small>{c.paused?'已暂停':'剩余'}</small></span>
   <span><b data-testid="counter-served">{frame?.served??0}</b><small>已送达 / 目标 {ch.target}</small></span>
   <span><b>{currentRun?.result.revenue??0}</b><small>营业收入</small></span>
   <span className={(frame?.lost??0)>0?'counter-warning':''}><b>{frame?.lost??0}</b><small>流失</small></span>
   <button onClick={c.togglePause} aria-label={c.paused?'继续营业':'暂停营业'}>{c.paused?<Play size={16}/>:<Pause size={16}/>}<span>{c.paused?'继续':'暂停'}</span></button>
  </div>}
  <section className="counter-scene" aria-label="奶茶店：左边制作台，右边取餐台，前方客人座位" inert={modal}>
   <TeaCounterScene level={home.shop.level} team={team} roles={roles} frame={frame} liveFrame={frame} stockMax={currentRun?.plan.stock??c.stock} events={c.events} supportAt={c.supportAt} selfAvatar={me?.avatarUrl} selfId="self" live={playing&&!c.paused} canAssign={playing&&!c.paused&&!modal&&!selfTask?.queuedRole} onAssign={assign}/>
   <div className="counter-scene-caption"><span>制作台</span><i>制作 → 取餐 → 端送</i><span>取餐台</span></div>
   {playing&&<div className="counter-orders" aria-label="当前订单" data-testid="counter-orders">
    <div><b>订单</b><span>{orders} 待做 · {ready} 待送</span></div>
    <ul>{frame?.customersState.filter(x=>['maker','making','ready','delivering'].includes(x.state)).slice(0,6).map(x=><li key={x.id} className={`order-${x.state}`}>
     <b>#{x.id}</b><span>{x.state==='maker'?'待制作':x.state==='making'?'制作中':x.state==='ready'?'可端送':'端送中'}</span><i style={{width:`${Math.max(8,(x.patience??1)*100)}%`}}/>
    </li>)}</ul>
    {!(orders||ready)&&!frame?.customersState.some(x=>x.state==='making'||x.state==='delivering')&&<small>等客人入座下单</small>}
   </div>}
  </section>
  {view==='prep'&&<aside className="counter-prep tea-prep" inert={modal}>
   <div className="counter-section-title"><small>开门前，先安排好</small><h2>今天怎么经营？</h2><p>{ch.arrivals} 位客人 · 约 {Math.ceil(ch.duration/60)} 分钟 · 送达 {ch.target} 杯达标</p></div>
   <div className="counter-recipe"><CupSoda size={26}/><div><b>招牌珍珠奶茶</b><small>客人自动下单，做好后需要端送</small></div><strong>{ch.price}<small>金币 / 杯</small></strong></div>
   <div className="counter-positions">
    {(['maker','cashier'] as const).map(r=><div key={r}><span>{r==='maker'?<CupSoda size={20}/>:<HandPlatter size={20}/>}<b>{roleName(r)}岗</b></span><strong>{cover(r).length?cover(r).map(w=>w.name).join('、'):'你亲自来'}</strong><small>{cover(r).length?'员工全自动':`熟练 Lv.${1+Math.min(5,Math.floor((r==='maker'?(home.counter?.makerXp??0):(home.counter?.serviceXp??0))/10))} · 点一次做一批`}</small></div>)}
   </div>
   <section className="counter-crew"><header><h3><Users size={16}/>安排员工 <small>可选 · 最多 2 人</small></h3><button onClick={onHall}>雇佣大厅<ChevronRight size={14}/></button></header>
    {c.pool.length?<div className="counter-crew-list">{c.pool.map(w=>{const on=c.team.some(x=>x.id===w.id);return <div className={on?'selected':''} key={w.id}>
     <button data-testid={`tea-staff-${w.id}`} aria-pressed={on} onClick={()=>c.pick(w.id)}><Face w={w} size={32}/><span><b>{w.name}</b><small>{w.salary} 金币 / 班</small></span>{on&&<Check size={16}/>}</button>
     {on&&<select aria-label={`${w.name}的岗位`} value={c.roles[w.id]??'maker'} onChange={e=>c.setRole(w.id,e.target.value as TeaRole)}><option value="maker">制作</option><option value="cashier">端送</option><option value="support">忙时补位</option></select>}
    </div>})}</div>:<p className="counter-empty">先自己做第一天也能赚钱。雇来的学徒做杂活升到 Lv2 后，就能来店里帮忙。</p>}
   </section>
   <div className="counter-stock"><h3><Package size={16}/>备原料</h3><div>{(home.business?.stockOptions??[20,40,60]).map(n=><button key={n} aria-pressed={c.stock===n} onClick={()=>c.setStock(n as typeof c.stock)}>{n} 份{n===home.business?.recommendedStock&&<small>推荐</small>}</button>)}</div></div>
   <div className="counter-budget"><span>预付成本 <strong>{c.totalCost}</strong></span><small>原料 {c.stock*ch.materialCost} + 工资 {staff.reduce((n,w)=>n+w.salary,0)} + 运营 {ch.operatingCost}</small></div>
   {c.problems.map(p=><p className="counter-warning" key={p}>{p}</p>)}
   {home.mission.status==='offered'&&<button className="tea-btn" data-testid="town-accept-mission" disabled={c.busy} onClick={()=>void c.acceptMission()}>接下手机里的救店任务</button>}
   <button className="tea-btn primary counter-open" disabled={c.busy||c.problems.length>0||home.wallet.balance<c.totalCost} onClick={()=>setConfirm('official')}>正式开店 <ArrowLeft className="counter-arrow" size={18}/></button>
   <button className="counter-practice" disabled={c.busy||c.problems.length>0} onClick={()=>setConfirm('practice')}>免费试营业</button>
   {home.business?.upgradeReady&&home.shop.level<3&&<button className="counter-upgrade" disabled={c.busy||home.wallet.balance<home.shop.nextUpgradeCost} onClick={()=>void c.upgrade()}>升级门店 · {home.shop.nextUpgradeCost} 金币</button>}
  </aside>}
  {playing&&<footer className="counter-dock" inert={modal}>
   <div className="counter-hint" role="status"><b>{hint}</b>{selfTask?.queuedRole&&<span>下一批已安排：{roleName(selfTask.queuedRole)}</span>}</div>
   <div className="counter-action-row">
    {(['maker','cashier'] as const).map(r=><button key={r} data-testid={`counter-${r}`} className={`counter-action action-${r} ${(r==='cashier'?ready:orders)>0&&!cover(r).length?'needs-you':''}`} disabled={!can(r)} onClick={()=>assign(r)}>
     {r==='maker'?<CupSoda size={26}/>:<HandPlatter size={26}/>}<span><b>{r==='maker'?'制作饮品':'端送饮品'}</b><small>{r==='maker'?`${orders} 单待做`:`${ready} 杯待送`} · {cover(r).length?'员工在做，你可帮忙':'点一次自动完成本批'}</small></span><kbd>{r==='maker'?'1':'2'}</kbd>
    </button>)}
   </div>
   <div className="counter-jobline"><span>你 · {taskActive?`${roleName(selfTask.role)} ${selfTask.done}/3`:'待命'}</span>{staff.map(w=><span key={w.id}>{w.name} · {roleName(roles[w.id])} · 自动</span>)}<span>原料 {Math.floor(frame?.stock??0)}</span></div>
  </footer>}
  {guide&&!modal&&<section className="counter-guide" data-testid="counter-guide"><header><b>{playing?'跟着订单，做出第一杯':'第一次开店'}</b><button onClick={finishGuide} aria-label="跳过店内引导">跳过</button></header>
   <ol><li className={made>0?'done':''}><b>1</b>客人下单后，点「制作饮品」</li><li className={served>0?'done':''}><b>2</b>出现待送杯子，点「端送饮品」</li><li className={served>0?'done':''}><b>3</b>送到手才收钱，员工会自己做</li></ol>
   {served>0&&<button className="tea-btn primary" onClick={finishGuide}>会了，继续经营</button>}
  </section>}
  {c.toast&&<div className="counter-toast" role="status">{c.toast}</div>}
  {confirm&&view==='prep'&&<OpenConfirm mode={confirm} challenge={ch} team={team} roles={roles} stock={c.stock} strategy={c.strategy} cost={{material:c.stock*ch.materialCost,wages:staff.reduce((n,w)=>n+w.salary,0),operating:ch.operatingCost,total:c.totalCost}} balance={home.wallet.balance} busy={c.busy} blocked={c.problems[0]??(confirm==='official'&&home.wallet.balance<c.totalCost?'金币不足':'')} onCancel={()=>setConfirm(null)} onStart={()=>void c.start(confirm).then(()=>setConfirm(null))}/>}
  {report&&c.run&&<ReportDialog run={c.run} home={home} busy={c.busy} bonusFor={home.mission.runId===c.run.id} canUpgrade={!!home.business?.upgradeReady&&home.shop.level<3} nextGoal={home.business?.goal??''} onUpgrade={()=>void c.upgrade()} onPrep={c.next} onExit={onExit}/>}
 </main>;
}
