import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../ui/useDialogFocus.ts';
import type { TeaLiveHome } from '../../shared/teaLive.ts';

// 手机：只有“任务 / 钱包”两页。金币与任务状态全部读 home（服务端权威），这里不记账。
const KIND: Record<string, string> = {
  tea_hold: '开店预付', tea_sales: '营业收入', tea_wage: '打工工资', tea_upgrade: '门店升级',
  tea_cost: '开店成本', tea_opening_grant: '启动金', tea_mission: '救店奖励',
};
const kindName = (k: string) => KIND[k] ?? (k.startsWith('tea') ? '奶茶店' : '其他');
const when = (at: number) => new Date(at < 1e12 ? at * 1000 : at).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export type PhoneTab = 'mission' | 'wallet';

export function TownPhone({ home, tab, onTab, onClose, onAccept, onGo, busy, hires }: {
  home: TeaLiveHome; tab: PhoneTab; onTab: (t: PhoneTab) => void; onClose: () => void;
  onAccept: () => Promise<void>; onGo: (site: 'shop' | 'recruit') => void; busy: boolean; hires: number;
}) {
  const m = home.mission;
  const [err, setErr] = useState('');
  const box = useRef<HTMLElement>(null);
  useDialogFocus(box, true);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const accept = async () => {
    setErr('');
    try { await onAccept(); } catch (e) { setErr(e instanceof Error ? e.message : '没接上，再试一次'); }
  };
  return <div className="town-phone-wrap" onPointerDown={e => e.target === e.currentTarget && onClose()}>
    <section ref={box} className="town-phone" data-testid="town-phone" role="dialog" aria-modal="true" aria-label="手机" tabIndex={-1}>
      <header>
        <nav>
          <button className={tab === 'mission' ? 'on' : ''} onClick={() => onTab('mission')}>任务{m.status === 'offered' && <i />}</button>
          <button className={tab === 'wallet' ? 'on' : ''} onClick={() => onTab('wallet')}>钱包</button>
        </nav>
        <button className="town-x" onClick={onClose} aria-label="收起手机">×</button>
      </header>

      {tab === 'mission' && <div className="town-mission" data-testid="town-mission" data-status={m.status}>
        <div className="town-msg">
          <b>街角奶茶 · 店长</b>
          <p>{m.status === 'completed' ? '店救回来了，谢谢你！以后常来。' : '小店快倒闭了，来帮个忙？'}</p>
        </div>
        <h3>救救街角奶茶 <em>{m.status === 'offered' ? '新任务' : m.status === 'accepted' ? '进行中' : '已完成'}</em></h3>
        <ol className="town-steps">
          <li className={m.status !== 'offered' ? 'done' : ''}>接下任务</li>
          <li className={hires > 0 ? 'done' : 'opt'}>广场招帮手 <small>可选 · {hires}/2</small></li>
          <li className={m.status === 'completed' ? 'done' : ''}>到店正式营业，赚到钱</li>
        </ol>
        {m.status === 'completed' && <p className="town-income">本次净赚 <b>+{m.income}</b> 金币</p>}
        {m.status === 'offered'
          ? <div className="town-row">
            <button className="tea-btn primary" disabled={busy} onClick={() => void accept()} data-testid="town-accept-mission">接下任务</button>
            <button className="tea-btn ghost" onClick={onClose}>先逛逛</button>
          </div>
          : <div className="town-row">
            <button className="tea-btn" onClick={() => onGo('recruit')} data-testid="town-go-recruit">去广场找帮手<small>可选</small></button>
            <button className="tea-btn primary" onClick={() => onGo('shop')} data-testid="town-go-shop">带路去奶茶店</button>
          </div>}
        {err && <p className="tea-hint bad">{err}</p>}
      </div>}

      {tab === 'wallet' && <div className="town-wallet" data-testid="town-wallet">
        <div className="town-balance"><span>金币</span><b>{home.wallet.balance}</b></div>
        {home.wallet.entries.length
          ? <ul>{home.wallet.entries.map(e => <li key={e.id}>
            <span>{kindName(e.kind)}<small>{when(e.at)}</small></span>
            <b className={e.delta >= 0 ? 'ok' : 'bad'}>{e.delta >= 0 ? '+' : ''}{e.delta}</b>
          </li>)}</ul>
          : <p className="tea-empty">还没有收支</p>}
      </div>}
    </section>
  </div>;
}
