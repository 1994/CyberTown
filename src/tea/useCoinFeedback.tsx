import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sound } from '../audio.ts';
import './coin-feedback.css';
/** Observe confirmed wallet changes only: opening a page never celebrates a balance. */
export function useCoinFeedback(player:string,balance:number|undefined){
 const last=useRef<{player:string;balance:number}|null>(null);
 const [gain,setGain]=useState<{amount:number;key:number}|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{
  if(balance===undefined)return;
  const before=last.current;last.current={player,balance};
  if(!before||before.player!==player||balance<=before.balance)return;
  setGain({amount:balance-before.balance,key:Date.now()});sound.play('coins');
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>setGain(null),2800);
 },[player,balance]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
 return gain?createPortal(<div className="coin-arrival" key={gain.key} role="status" aria-live="polite"><span className="coin-arrival-icon">₵</span><div><small>金币到账</small><strong>+{gain.amount.toLocaleString()}</strong></div>{Array.from({length:8},(_,i)=><i key={i} style={{'--i':i} as React.CSSProperties}>₵</i>)}</div>,document.body):null;
}
