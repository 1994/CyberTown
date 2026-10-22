import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Gamepad2, LockKeyhole, Ticket, X } from 'lucide-react';
import { teaCall } from './liveApi';
import './arcade.css';

export interface ArcadeTicket { id: string; gameId: string; fee: number }
/** Register each future game here; its server catalog must also be ready. */
export const arcadeGames: Record<string, ComponentType<{ ticket: ArcadeTicket; onExit: () => void }>> = {};
type Catalog = { games: { id: string; name: string; fee: number; ready: boolean }[] };
export function ArcadeHall({ playerId, coins, onClose, onPaid }: { playerId: string; coins: number; onClose: () => void; onPaid: () => void }) {
 const [catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<string|null>(null),[ticket,setTicket]=useState<ArcadeTicket|null>(null);
 const receiptKey=(id:string)=>`arcade-pending:${playerId}:${id}`;
 const select=(id:string)=>{
   let pending='';try{pending=localStorage.getItem(receiptKey(id))??'';}catch{/* storage optional */}
   key.current=pending||crypto.randomUUID();try{localStorage.setItem(receiptKey(id),key.current);}catch{/* current attempt remains retryable */}
   setSelected(id);
 };
 const key=useRef(''),close=useRef<HTMLButtonElement>(null);
 const load=()=>{setError('');void teaCall<Catalog>('GET','/api/tea/arcade').then(setCatalog).catch(e=>setError(e.message));};
 useEffect(()=>{load();const before=document.activeElement as HTMLElement|null;close.current?.focus();return()=>{before?.focus();};},[]);
 useEffect(()=>{const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){e.stopPropagation();if(selected)setSelected(null);else onClose();}};window.addEventListener('keydown',esc);return()=>window.removeEventListener('keydown',esc);},[selected,busy,onClose]);
 const game=catalog?.games.find(g=>g.id===selected);
 const join=async()=>{if(!game||!arcadeGames[game.id]||busy)return;setBusy(true);setError('');try{const t=await teaCall<ArcadeTicket>('POST','/api/tea/arcade/register',{gameId:game.id,key:key.current});setTicket(t);onPaid();}catch(e){setError(e instanceof Error?e.message:'报名失败，可重试');}finally{setBusy(false);}};
 const Play=ticket&&arcadeGames[ticket.gameId];
 return <div className="arcade-backdrop" onKeyDown={e=>{if(e.key==='Tab'){const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
 <section className="arcade-hall" role="dialog" aria-modal="true" aria-label="小游戏大厅" data-testid="arcade-hall">
 <header><div><small>NEON PLAYGROUND</small><h1><Gamepad2/>小游戏大厅</h1></div><span className="arcade-wallet">● {coins}</span><button ref={close} className="tea-btn" disabled={busy} onClick={onClose} aria-label="离开小游戏大厅"><X size={20}/></button></header>
 {Play&&ticket?<Play ticket={ticket} onExit={()=>{try{localStorage.removeItem(receiptKey(ticket.gameId));}catch{/* optional */}setTicket(null);setSelected(null);}}/>:<>
 <div className="arcade-marquee" aria-hidden="true"><Gamepad2/><i>PLAY<br/>YOUR WAY</i><span>✦</span></div>
 <p className="arcade-caption">逛大厅免费 · 开局前确认报名费</p>
 {!catalog&&!error&&<p role="status">读取机台…</p>}
 <div className="arcade-cabinets">{catalog?.games.map(g=>{const ready=g.ready&&!!arcadeGames[g.id];return <article key={g.id} className={`arcade-cabinet ${ready?'ready':''}`}><div className="arcade-screen"><Gamepad2 size={52}/>{!ready&&<LockKeyhole size={20}/>}</div><h2>{g.name}</h2><p><Ticket size={16}/>报名 {g.fee} 金币 / 次</p><button className="tea-btn primary" disabled={!ready||busy||coins<g.fee} onClick={()=>select(g.id)}>{!ready?'即将开放':coins<g.fee?'金币不足':'报名'}</button>{!ready&&<small>上线前不扣金币</small>}</article>;})}</div>
 {game&&<div className="arcade-confirm"><h2>报名 {game.name}</h2><p>本次支付 {game.fee} 金币</p><button className="tea-btn" disabled={busy} onClick={()=>setSelected(null)}>再看看</button><button className="tea-btn primary" disabled={busy||coins<game.fee} onClick={()=>void join()}>{busy?'报名中…':'确认支付并进入'}</button></div>}
 </>}
 {error&&<p role="alert">{error} {!catalog&&<button className="tea-btn" onClick={load}>重试</button>}</p>}
 </section></div>;
}
