import {useSyncExternalStore} from 'react';
import {TABLE,clearFinishedRound,creditThrough,startRound,shellFrame,type DemoWallet,type Phase,type TableGame} from '../../shared/tableGames';
const KEY='cyber-town.table-demo.v1';
const listeners=new Set<()=>void>();
function read():DemoWallet {const raw=localStorage.getItem(KEY);if(!raw)return {version:1,balance:TABLE.initial,round:null};const s=JSON.parse(raw) as DemoWallet;if(s.version!==1||!Number.isSafeInteger(s.balance)||s.balance<0)throw Error('试玩存档无法读取，请保留存档并重试');return s;}
let snapshot=read();
const emit=()=>{snapshot=read();listeners.forEach(f=>f());};
export function useDemoWallet(){return useSyncExternalStore(f=>{listeners.add(f);window.addEventListener('storage',emit);return()=>{listeners.delete(f);window.removeEventListener('storage',emit);};},()=>snapshot);}
export async function transact(fn:(s:DemoWallet)=>DemoWallet){
 if(!navigator.locks)throw Error('当前浏览器不支持安全保存试玩余额，请使用新版浏览器');
 return navigator.locks.request(KEY,()=>{const next=fn(read());localStorage.setItem(KEY,JSON.stringify(next));emit();return next;});
}
function random(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}
export const bet=(game:TableGame,n:number,face:0|1)=>transact(s=>startRound(s,game,n,face,crypto.randomUUID(),random,Date.now()));
export const claim=()=>transact(s=>s.round&&s.round.phase!=='result'?s:{...s,balance:s.balance+1000});
export const reset=()=>transact(clearFinishedRound);
export function advance(id:string,from:Phase,to:Phase){return transact(s=>{
 const r=s.round;if(!r||r.id!==id||r.phase!==from)return s;
 const win=to==='payout'?true:to==='loss'?false:r.win;
 if(to==='result'&&r.phase==='payout')s=creditThrough(s,r.count*2);
 return {...s,round:{...s.round!,phase:to,at:Date.now(),win}};
});}
export const choose=(id:string,slot:number)=>transact(s=>{const r=s.round;if(!r||r.id!==id||r.phase!=='pick')return s;return {...s,round:{...r,phase:'reveal',at:Date.now(),picked:slot,win:shellFrame(r.swaps,2).coreSlot===slot}};});
export const credit=(id:string,n:number)=>transact(s=>s.round?.id===id?creditThrough(s,n):s);
