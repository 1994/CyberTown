import {useEffect,useRef,useState} from 'react';
import {Coins,ArrowLeft} from 'lucide-react';
import {TABLE,award,clamp01,validBet,type TableGame,type Phase} from '../../shared/tableGames';
import {advance,bet,choose,claim,credit,reset,useDemoWallet} from './wallet';
import {TableScene} from './TableScene';
import {SoundMenu} from '../ui/SoundControl';
import {sound} from '../audio';
import './table.css';
const HINT:Record<Phase,string>={toss:'金币入桌',hammer:'点击桌上的榔头',strike:'蓄力…',flip:'等待硬币落下',settle:'即将揭晓',shuffle:'追踪能量核心',pick:'选一个罩子',reveal:'正在揭晓',payout:'奖励回到手中',loss:'本轮未猜中',result:'本轮结算'};
export default function TableGames({initialGame,onExit}:{initialGame:TableGame;onExit:()=>void}){
 const wallet=useDemoWallet();const r=wallet.round;const [selectedGame,setGame]=useState<TableGame>(r?.game??initialGame);const game=r&&r.phase!=='result'?r.game:selectedGame;
 const [amount,setAmount]=useState(100),[face,setFace]=useState<0|1>(0),[error,setError]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const pending=useRef(false),coinSound=useRef(0);const active=!!r&&r.phase!=='result';
 const run=async(fn:()=>Promise<unknown>)=>{if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await sound.activate();await fn();}catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试');}finally{pending.current=false;setBusy(false);}};
 const hammer=()=>{if(r?.phase==='hammer')void run(()=>advance(r.id,'hammer','strike'));};
 const pick=(slot:number)=>{if(r?.phase==='pick')void run(()=>choose(r.id,slot));};
 useEffect(()=>{let inFlight=false;const timer=setInterval(()=>{if(!r||inFlight)return;const t=(Date.now()-r.at)/1000;let next:Phase|null=null;
  if(r.phase==='toss'&&t>=TABLE.tossSeconds)next=game==='coin'?'hammer':'shuffle';
  if(r.phase==='strike'&&t>=.48)next='flip';
  if(r.phase==='flip'&&t>=TABLE.flightSeconds)next='settle';
  if(r.phase==='settle'&&t>=TABLE.settleSeconds)next=r.face===r.outcome?'payout':'loss';
  if(r.phase==='shuffle'&&t>=TABLE.swaps*TABLE.swapSeconds)next='pick';
  if(r.phase==='reveal'&&t>=1.65)next=r.win?'payout':'loss';
  if(r.phase==='loss'&&t>=2)next='result';
  if(r.phase==='payout'&&t>=TABLE.returnDuration+(r.count*2-1)*TABLE.returnStagger+.25)next='result';
  const n=Math.min(r.count*2,Math.max(0,Math.floor((t-TABLE.returnDuration)/TABLE.returnStagger)+1));
  if(next||r.phase==='payout'&&n>r.credited){inFlight=true;void(next?advance(r.id,r.phase,next):credit(r.id,n)).catch(e=>setError(String(e))).finally(()=>{inFlight=false;});}
 },35);return()=>clearInterval(timer);},[r,game]);
 useEffect(()=>{const activate=()=>void sound.activate();document.addEventListener('pointerdown',activate);const visible=()=>{if(document.hidden)sound.pause();};document.addEventListener('visibilitychange',visible);return()=>{document.removeEventListener('pointerdown',activate);document.removeEventListener('visibilitychange',visible);};},[]);
 useEffect(()=>{if(!active)setAmount(n=>Math.max(10,Math.min(n,1000,Math.floor(wallet.balance/10)*10)));},[active,wallet.balance]);
 const changeAmount=(n:number)=>{setAmount(Math.max(10,Math.min(1000,Math.floor(n/10)*10,Math.floor(wallet.balance/10)*10)));if(performance.now()-coinSound.current>95){coinSound.current=performance.now();void sound.activate().then(()=>sound.play('catch'));}};
 const switchGame=(g:TableGame)=>{if(active||busy||g===game)return;void run(async()=>{await reset();setGame(g);});};
 const maxBet=Math.max(10,Math.min(1000,Math.floor(wallet.balance/10)*10));const fill=`${((amount-10)/Math.max(1,maxBet-10))*100}%`;
 return <main className="table-game" data-testid="table-game" data-game={game} data-phase={r?.phase??'idle'}>
  <header className="table-header">
   <button className="table-back" aria-label="返回游玩区域" disabled={active||busy} onClick={onExit}><ArrowLeft size={18}/></button>
   <div className="table-wordmark"><small>NIGHT MARKET</small><b>霓虹赌摊</b></div>
   <nav className="table-tabs" aria-label="试玩场景"><button aria-pressed={game==='coin'} disabled={active||busy} onClick={()=>switchGame('coin')}><i aria-hidden="true">★</i>幸运翻币</button><button aria-pressed={game==='shell'} disabled={active||busy} onClick={()=>switchGame('shell')}><i aria-hidden="true">◎</i>三杯幻影</button></nav>
   <div className="table-wallet" aria-label="试玩金币"><span className="table-coin-ico"><Coins size={15}/></span><b data-testid="demo-balance">{wallet.balance.toLocaleString()}</b><button className="table-claim" disabled={active||busy} onClick={()=>void run(()=>claim())} aria-label="免费领取1000枚试玩金币">+1000</button></div>
   <SoundMenu/>
  </header>
  <section className="table-stage"><TableScene game={game} round={r} onHammer={hammer} onPick={pick} onReady={setReady}/>
   <div className="table-stage-heading"><span>0{game==='coin'?1:2} / STREET TABLE</span><h1>{game==='coin'?'星与月，一锤定局':'看准核心，凭直觉选'}</h1></div>
   <div className={`table-phase ${r?.phase==='hammer'||r?.phase==='pick'?'is-call':''}`} role="status"><i aria-hidden="true"/>{r?HINT[r.phase]:game==='coin'?'选正反 · 下注 · 挥锤':'盯住核心 · 下注开始换位'}</div>
   {r?.phase==='hammer'&&<span className="table-key-hint">Tab 聚焦桌面 · Enter 挥锤</span>}
  </section>
  <footer className={`table-console ${r?.phase==='result'?(r.win?'is-win':'is-lose'):''}`}>
   {(!r||r.phase==='result')&&r?.phase!=='result'?<div className="table-bet">
    <div className="table-stake">
     <div className="table-stake-read"><small>下注</small><b>{amount}</b><span className="table-arrow" aria-hidden="true">→</span><small>猜中到账</small><b className="pay">{award(amount,true)}</b><em>含本金 · 净赚 {amount}</em></div>
     <input aria-label="下注金额" type="range" min={10} max={maxBet} step={10} value={amount} disabled={busy||wallet.balance<10} style={{['--fill' as string]:fill}} onChange={e=>changeAmount(Number(e.target.value))}/>
     <div className="table-presets">{[50,100,500].map(n=><button key={n} className={`chip c${n}`} aria-pressed={amount===n} disabled={busy||wallet.balance<n} onClick={()=>changeAmount(n)}>{n}</button>)}<button className="chip cmax" disabled={busy||wallet.balance<10} onClick={()=>changeAmount(Math.min(1000,wallet.balance))}>MAX</button></div>
    </div>
    <div className="table-actions">{game==='coin'&&<div className="table-faces" role="group" aria-label="猜正反"><button aria-pressed={face===0} disabled={busy} onClick={()=>setFace(0)}><i aria-hidden="true">★</i>正面</button><button aria-pressed={face===1} disabled={busy} onClick={()=>setFace(1)}><i aria-hidden="true">☾</i>反面</button></div>}<button className="table-primary" disabled={busy||!ready||!validBet(amount,wallet.balance)} onClick={()=>void run(()=>bet(game,amount,face))}>确认下注 · {amount}</button></div>
   </div>:r?.phase==='result'?<div className="table-result" role="status">
    <div className="table-result-head"><small>{r.win?'猜中了':'下次好运'}{game==='coin'?` · ${r.outcome===0?'★ 幸运星':'☾ 弯月'}`:''}</small><strong className={r.win?'win':'lose'}>{r.win?'+':'−'}{r.bet}<em>{r.win?'本轮净赚':'本轮损失'}</em></strong></div>
    <dl><div><dt>开局余额</dt><dd>{r.opening}</dd></div><div><dt>本轮下注</dt><dd>−{r.bet}</dd></div><div><dt>本轮到账</dt><dd>{award(r.bet,!!r.win)}</dd></div><div className="total"><dt>结算余额</dt><dd>{r.opening-r.bet+award(r.bet,!!r.win)}</dd></div></dl>
    <button className="table-primary" disabled={busy} onClick={()=>void run(()=>reset())}>再来一局</button>
   </div>:<div className="table-playing">
    <div className="table-locked"><small>下注已锁定</small><b>{r?.bet}<span>→ 猜中到账 {award(r?.bet??0,true)}</span></b></div>
    {game==='shell'?<div className="table-slot-buttons">{['左','中','右'].map((text,i)=><button key={text} disabled={r?.phase!=='pick'||busy} onClick={()=>pick(i)}>{text}</button>)}</div>:<p className={r?.phase==='hammer'?'is-call':''}>{r?.phase==='hammer'?'点击桌上的榔头':r?.phase==='payout'?'奖励到账中':r?.phase==='loss'?'本轮未猜中':'等待结果'}</p>}
    {r?.phase==='payout'&&<progress max={1} value={clamp01(r.credited/(r.count*2))} aria-label="奖励到账进度"/>}
   </div>}
   {error&&<p role="alert" className="table-error">{error}</p>}<small className="table-disclaimer">独立试玩金币 · 不影响小镇余额及业绩</small>
  </footer>
 </main>;
}
