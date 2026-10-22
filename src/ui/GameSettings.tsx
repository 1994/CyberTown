import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, RotateCcw } from 'lucide-react';
import { SoundSettings } from './SoundControl.tsx';
import { useDialogFocus } from './useDialogFocus.ts';
import { useGame } from '../store.ts';
import { useTownState } from '../tea/townState.ts';
import { useWorld } from '../world/runtime.ts';
import { teaCall } from '../tea/liveApi.ts';
import { sessionKey } from '../runtime-config.ts';
import './game-settings.css';

export function GameSettings({ className = '' }: { className?: string }) {
 const [open, setOpen] = useState(false);
 const [confirm, setConfirm] = useState(false);
 const [busy, setBusy] = useState(false);
 const pending = useRef(false);
 const [error, setError] = useState('');
 const ref = useRef<HTMLDivElement>(null);
 const me = useGame(s => s.snapshot?.me);
 const home = useTownState(s => s.home);
 const own = home && !home.visitor ? home : null;
 const close = () => { if (!pending.current) { setOpen(false); setConfirm(false); setError(''); } };
 useDialogFocus(ref, open);
 useEffect(() => {
  if (!open) return;
  useWorld.getState().lock('settings');
  void useTownState.getState().refresh().catch(() => {});
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  window.addEventListener('keydown', key, true);
  return () => { useWorld.getState().unlock('settings'); window.removeEventListener('keydown', key, true); };
 }, [open]);
 const restart = async () => {
  if (pending.current || !me || !own) return;
  pending.current = true; setBusy(true); setError('');
  try {
   await teaCall('POST', '/api/tea/restart', { confirm: 'restart-my-town' });
   const keys = [`town-place:${me.id}`, `tea3-plan:${me.id}`, `tea3-opening:${me.id}`, `${sessionKey()}.town-arrival:v2:${me.id}`];
   try {
   for (const storage of [localStorage, sessionStorage]) {
    for (const key of [...keys, ...Object.keys(storage).filter(k => k.startsWith(`arcade-pending:${me.id}:`))]) storage.removeItem(key);
   }
   sessionStorage.removeItem('table-demo-screen');
   } catch { /* Restricted browser storage must not turn a successful reset into a retry. */ }
   window.location.reload();
  } catch (e) { setError(e instanceof Error ? e.message : '重置失败，请重试'); pending.current = false; setBusy(false); }
 };
 return <>
  <button className={`sound-menu-btn ${className}`} aria-label="设置" title="设置" aria-expanded={open} onClick={() => setOpen(true)}><Settings size={19}/></button>
  {open && createPortal(<div className="game-settings-shade" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
   <div ref={ref} className="game-settings" role="dialog" aria-modal="true" aria-label="小镇设置" tabIndex={-1}>
    <header><div><small>CYBER TOWN / SYSTEM</small><h2><Settings size={23}/> 小镇设置</h2></div><button aria-label="关闭设置" disabled={busy} onClick={close}><X/></button></header>
    <section className="settings-identity">{me?.avatarUrl ? <img src={me.avatarUrl} alt=""/> : <span className="settings-avatar">{me?.name.slice(0,1)}</span>}<div><strong>{me?.name ?? '小镇居民'}</strong><small>赛博小镇 · 模拟经营试玩版</small></div></section>
    <dl className="settings-stats"><div><dt>金币</dt><dd>{(own?.coins ?? me?.coins ?? 0).toLocaleString()}</dd></div><div><dt>小镇等级</dt><dd>{own ? `Lv.${own.level}` : '参观中'}</dd></div><div><dt>奶茶店</dt><dd>{own ? `Lv.${own.shopLevel}` : '—'}</dd></div><div><dt>员工</dt><dd>{own ? `${own.clones.length} 人` : '—'}</dd></div></dl>
    <h3>声音配置</h3><SoundSettings/>
    <section className="settings-restart">
     {!confirm ? <><button disabled={!own} onClick={() => setConfirm(true)}><RotateCcw size={16}/>重新开始</button><small>{own ? '从第一天重新经营你的小镇' : '回到自己的小镇后可重置进度'}</small></> : <><h3>确定从头开始？</h3><p>当前玩家的金币、店铺升级、员工、物品、任务和熟练度将重置，新手引导会重新出现。此操作无法撤销。</p><small>保留身份、同事目录、声音配置和小游戏试玩余额，不影响其他玩家的小镇。</small><div className="settings-actions"><button disabled={busy} onClick={() => setConfirm(false)}>继续当前旅程</button><button className="settings-danger" disabled={busy} onClick={() => void restart()}>{busy ? '正在重置…' : '确认重置并重新开始'}</button></div></>}
     {error && <p role="alert">{error}</p>}
    </section>
   </div>
  </div>, document.body)}
 </>;
}
