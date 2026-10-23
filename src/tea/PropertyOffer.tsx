import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, X } from 'lucide-react';
import { useTownState } from './townState.ts';
import { useWorld } from '../world/runtime.ts';
import { useDialogFocus } from '../ui/useDialogFocus.ts';
import { useGame } from '../store.ts';
import { sound } from '../audio.ts';
import './property.css';
export function PropertyOffer({offer}:{offer:{id:string;name:string;price:number}}){
 const home=useTownState(s=>s.home),busy=useTownState(s=>s.busy);
 const owned=home?.properties?.includes(offer.id);
 const [open,setOpen]=useState(false),[error,setError]=useState('');
 const ref=useRef<HTMLDivElement>(null);
 const pending=useRef(false);
 const close=()=>{if(!pending.current){setOpen(false);setError('')}};
 useDialogFocus(ref,open);
 useEffect(()=>{if(!open)return;useWorld.getState().lock('property');const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();close()}};window.addEventListener('keydown',key,true);return()=>{useWorld.getState().unlock('property');window.removeEventListener('keydown',key,true)}},[open]);
 const buy=async()=>{if(pending.current)return;pending.current=true;try{await useTownState.getState().buyProperty(offer.id,offer.price);sound.play('coins');useGame.getState().toast({tone:'gold',title:'新铺面已购入',body:offer.name});setOpen(false)}catch(e){setError(e instanceof Error?e.message:'购买失败，请重试')}finally{pending.current=false}};
 return <><span className="town-locked-status">{owned?`已购入 · ${home?.visitor?'镇主':'你的'}铺面`:`${(offer.price/10000).toLocaleString()} 万金币 · 铺面出售`}</span>
 <button className="property-open" onClick={e=>{e.stopPropagation();setOpen(true)}}><Building2 size={13}/>{owned?'查看产权':'查看购买'}</button>
 {open&&createPortal(<div className="property-shade" onClick={e=>{if(e.target===e.currentTarget)close()}}><section ref={ref} className="property-dialog" role="dialog" aria-modal="true" aria-label="购买铺面" tabIndex={-1}>
 <header><span>商业版图 / PROPERTY</span><button aria-label="关闭购买窗口" disabled={busy} onClick={close}><X size={20}/></button></header>
 <Building2 size={38}/><h2>{offer.name}</h2><p className="property-price">{offer.price.toLocaleString()} <small>金币</small></p>
 <p>购入后永久记录为你的小镇资产，地图显示归属。</p><p className="property-notice">仅购买铺面产权。店内经营尚未开放，暂不产生收益。</p>
 <dl><div><dt>现有金币</dt><dd>{home?.coins.toLocaleString()}</dd></div><div><dt>{owned?'产权状态':home&&home.coins<offer.price?'还需积累':'购入后剩余'}</dt><dd>{owned?'已购入':Math.abs((home?.coins??0)-offer.price).toLocaleString()}</dd></div></dl>
 {error&&<p role="alert">{error}</p>}<button className="property-buy" disabled={busy||owned||home?.visitor||!home||home.coins<offer.price} onClick={()=>void buy()}>{owned?'已拥有该铺面':home?.visitor?'参观中不可购买':busy?'购买中…':home&&home.coins<offer.price?'金币不足 · 继续经营':`确认购买 · ${offer.price.toLocaleString()} 金币`}</button>
 </section></div>,document.body)}</>;
}
