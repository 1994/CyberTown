import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Fish,Coins} from 'lucide-react';
import {FISH,FISHING,newFishingRound,castFishing,pullFishing,tickFishing,fishingReward,type FishingRound} from '../../shared/fishing';
import {settleFishing,useDemoWallet} from './wallet';
import {FishingScene} from './FishingScene';
import {SoundMenu} from '../ui/SoundControl';
import {sound} from '../audio';
import './fishing.css';
const KEY='cyber-town.fishing.v1';
function load():FishingRound{try{const s=JSON.parse(localStorage.getItem(KEY)??'null') as FishingRound|null;if(s&&typeof s.id==='string'&&Array.isArray(s.catches)&&s.catches.every(i=>Number.isInteger(i)&&i>=0&&i<3)&&Number.isFinite(s.started)&&['aim','wait','bite','reel','caught','escaped','result'].includes(s.phase))return {...s,held:false};}catch{/* a new free session remains available */}return {...newFishingRound('',Date.now()),phase:'ready'};}
export default function FishingGame({onExit}:{onExit:()=>void}){
 const [round,setRound]=useState(load),current=useRef(round),[error,setError]=useState(''),[paid,setPaid]=useState(false);
 const wallet=useDemoWallet(),active=round.phase!=='ready'&&round.phase!=='result';
 const commit=(next:FishingRound)=>{current.current=next;setRound(next);if(next.phase!=='ready')try{localStorage.setItem(KEY,JSON.stringify({...next,held:false}));}catch{setError('无法保存进度，请检查浏览器存储空间');}};
 const start=()=>{setPaid(false);setError('');void sound.activate();commit(newFishingRound(crypto.randomUUID(),Date.now()));};
 const pull=()=>{void sound.activate();commit(pullFishing(current.current,Date.now()));};
 const release=()=>{if(current.current.held)commit({...current.current,held:false});};
 const aim=(x:number)=>{if(current.current.phase==='aim')commit({...current.current,aim:Math.max(-4.4,Math.min(4.4,x))});};
 const cast=()=>{void sound.activate();commit(castFishing(current.current,Date.now()));};
 useEffect(()=>{let last=Date.now(),saved=0;const id=setInterval(()=>{const now=Date.now(),prev=current.current,next=tickFishing(prev,now,(now-last)/1000);last=now;
  if(next!==prev){if(next.phase!==prev.phase)sound.play(next.phase==='caught'?'catch':next.phase==='escaped'?'miss':next.phase==='bite'?'countdown':'ui');if(next.phase!==prev.phase||now-saved>700){commit(next);saved=now;}else{current.current=next;setRound(next);}}else if(next.phase!=='ready'&&next.phase!=='result')setRound({...next});
 },50);return()=>clearInterval(id);},[]);
 useEffect(()=>{const up=()=>release();const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,button,select,textarea')||e.repeat)return;
 if(e.code==='Space'){e.preventDefault();if(current.current.phase==='aim')cast();else pull();}
 if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();aim(current.current.aim+(e.key==='ArrowLeft'?-.5:.5));}};
 window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',up);document.addEventListener('visibilitychange',up);window.addEventListener('keydown',key);window.addEventListener('keyup',up);return()=>{window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',up);document.removeEventListener('visibilitychange',up);window.removeEventListener('keydown',key);window.removeEventListener('keyup',up);};},[]);
 const deposit=async()=>{try{await settleFishing(current.current.id,fishingReward(current.current.catches));setPaid(true);setError('');}catch(e){setError(e instanceof Error?e.message:'到账失败，请重试');}};
 useEffect(()=>{if(round.phase==='result')void deposit();},[round.phase,round.id]);
 const seconds=Math.max(0,Math.ceil(FISHING.seconds-(Date.now()-round.started)/1000));
 return <main className="fishing-game">
  <header><button aria-label="返回小游戏大厅" onClick={onExit} disabled={active||(round.phase==='result'&&!paid)}><ArrowLeft size={20}/></button><div><small>NEON ANGLER</small><b>霓虹夜钓</b></div><span className="fishing-wallet"><Coins size={18}/>{wallet.balance.toLocaleString()}</span><SoundMenu/></header>
  <section className="fishing-water" aria-label="钓鱼水面：左右拖动鱼竿，松开下钩" onPointerDown={e=>{if(current.current.phase==='aim'){e.currentTarget.setPointerCapture(e.pointerId);const b=e.currentTarget.getBoundingClientRect();aim((e.clientX-b.left)/b.width*10-5);}}} onPointerMove={e=>{if(e.buttons&&current.current.phase==='aim'){const b=e.currentTarget.getBoundingClientRect();aim((e.clientX-b.left)/b.width*10-5);}}} onPointerUp={()=>{if(current.current.phase==='aim')cast();}}>
   <FishingScene round={round}/>
   {active&&<><div className="fishing-score"><b>{seconds}s</b><span><Fish size={16}/>{round.catches.length} 条</span><span>鱼获 {fishingReward(round.catches)}</span></div><div className={`fishing-hint ${round.phase}`} role="status">{round.message}</div></>}
   {round.phase==='ready'&&<div className="fishing-overlay"><small>免费入场 · 60 秒挑战</small><h1>今晚，钓条大的。</h1><p>拖动下钩 → 浮标沉下时提竿<br/>按住收线，鱼挣扎时松手。</p><div className="fishing-species">{FISH.map(f=><span key={f.name} style={{color:f.color}}><Fish/>{f.name}<b>+{f.value}</b></span>)}</div><button className="fishing-primary" onClick={e=>{e.stopPropagation();start();}}>开始夜钓</button></div>}
   {round.phase==='result'&&<div className="fishing-overlay fishing-result" role="dialog" aria-label="夜钓鱼获报表"><small>今晚的鱼获</small><h1>{round.catches.length?`钓到 ${round.catches.length} 条！`:'鱼跑了，下次再来'}</h1><strong>+{fishingReward(round.catches)} <small>试玩金币</small></strong><div className="fishing-species">{FISH.map((f,i)=><span key={f.name} style={{color:f.color}}><Fish/>{f.name}<b>×{round.catches.filter(n=>n===i).length}</b></span>)}</div><p>{round.catches.length?`最大鱼获 ${Math.max(...round.catches.map(i=>FISH[i].weight))} kg`:'等浮标变金色，再按住提竿。'} · {paid?'已到账':'结算中'}</p><button className="fishing-primary" disabled={!paid} onClick={start}>再钓一局</button>{error&&<button onClick={()=>void deposit()}>重试到账</button>}</div>}
  </section>
  <footer>
   {active&&<><div className="fishing-meters"><label>拉近 <progress max={1} value={round.phase==='reel'?round.progress:0}/></label><label className={round.tension>.75?'danger':''}>张力 <progress max={1} value={round.phase==='reel'?round.tension:0}/></label></div>
   <div className="fishing-input"><label>鱼竿位置<input aria-label="鱼竿位置" type="range" min={-4.4} max={4.4} step={.1} value={round.aim} disabled={round.phase!=='aim'} onChange={e=>aim(+e.target.value)}/></label>{round.phase==='aim'?<button className="fishing-primary" onClick={cast}>下钩</button>:<button className={`fishing-primary ${round.phase==='bite'?'bite':''}`} disabled={!['wait','bite','reel'].includes(round.phase)} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);pull();}} onPointerUp={release} onPointerCancel={release} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();pull();}}} onKeyUp={release}>{round.phase==='bite'?'咬钩了！按住提竿':round.phase==='reel'?(round.held?'松开泄力':'按住收线'):round.phase==='caught'?'已钓起！':round.phase==='escaped'?'重新准备…':'等浮标沉下'}</button>}</div></>}
   {error&&<p role="alert">{error}</p>}<small>独立试玩金币 · 不影响小镇余额 · 方向键移动 / 空格下钩、收线</small>
  </footer>
 </main>;
}
