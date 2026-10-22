import { useEffect, useRef, useState } from 'react';
import { BatteryFull, ChevronLeft, Coins, Map, Users, Wifi, WifiOff, X } from 'lucide-react';
import { useGame } from '../store.ts';
import './townPhone.css';
import { useDialogFocus } from '../ui/useDialogFocus.ts';
import type { TeaLiveHome } from '../../shared/teaLive.ts';
import type { DestinationId, SiteId } from '../../shared/townPlan.ts';

// 复用原游戏手机机身与 KIM 标志；经营数据仍由服务端提供。
const KIND: Record<string, string> = {
  tea_hold: '开店预付', tea_sales: '营业收入', tea_wage: '打工工资', tea_upgrade: '门店升级',
  tea_cost: '开店成本', tea_opening_grant: '启动金', tea_mission: '救店奖励', town_explore: '商圈考察', town_hire: '员工签约', town_job: '派工收入', town_market_buy: '买入合同', town_market_sell: '转让收入', town_build: '小镇建设',
};
const kindName = (k: string) => KIND[k] ?? (k.startsWith('tea') ? '奶茶店' : '其他');
const when = (at: number) => new Date(at < 1e12 ? at * 1000 : at).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export type PhoneTab = 'home' | 'mission' | 'empire' | 'wallet';
const KIM_ICON = '/icons/kim.jpg';

export function TownPhone({ home, tab, onTab, onClose, onAccept, onGo, onHall, busy, hires, toast }: {
  home: TeaLiveHome; tab: PhoneTab; onTab: (t: PhoneTab) => void; onClose: () => void;
  onAccept: () => Promise<void>; onGo: (site: DestinationId) => void; onHall: () => void; busy: boolean; hires: number; toast?: string;
}) {
  const me = useGame(s => s.snapshot?.me);
  const conn = useGame(s => s.conn);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setClock(new Date()), 15000); return () => clearInterval(id); }, []);
  const m = home.mission;
  const biz = home.business;
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
  return <div className="phone-backdrop town-handset-wrap" onPointerDown={e => e.target === e.currentTarget && onClose()}>
    <section ref={box} className="game-phone town-handset" data-testid="town-phone" role="dialog" aria-modal="true" aria-label="手机" tabIndex={-1}>
      <span className="phone-side-button one"/><span className="phone-side-button two"/><span className="phone-side-button three"/>
      <div className={`phone-display ${tab === 'home' ? '' : 'app'} ${tab === 'mission' ? 'light town-kim' : ''}`}>
        <div className="phone-status"><time>{clock.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',hour12:false})}</time><span className="phone-island" aria-hidden="true"><i/></span><span className="phone-status-icons">{conn === 'live' ? <Wifi size={14}/> : <WifiOff size={14}/>}<BatteryFull size={18}/><button onClick={onClose} aria-label="收起手机"><X size={14}/></button></span></div>
        <div className="phone-wallpaper" aria-hidden="true"/>
        {tab !== 'home' && <header className="phone-page-head"><button onClick={() => onTab('home')} aria-label="返回手机桌面"><ChevronLeft size={20}/><span>桌面</span></button><h2>{tab === 'mission' ? <><img src={KIM_ICON} alt=""/>KIM</> : tab === 'wallet' ? '钱包' : '我的版图'}</h2></header>}
        <div className={`phone-screen ${tab === 'home' ? 'home' : ''}`} key={tab}>
          {tab === 'home' && <div className="phone-home town-phone-home" data-testid="town-phone-home">
            <div className="town-phone-greeting"><small>我的小镇</small><b>{me?.name}</b></div>
            <button className="town-kim-notification" onClick={() => onTab('mission')} data-testid="town-kim-notification"><img src={KIM_ICON} alt="KIM"/><span><b>KIM <small>街角奶茶 · 店长</small></b><span>{m.status === 'offered' ? '小店快倒闭了，来帮个忙？' : m.status === 'accepted' ? '任务已接下，等你来开店。' : '店救回来了，谢谢你！'}</span></span>{m.status === 'offered' && <i/>}</button>
            <nav className="phone-app-grid" aria-label="手机应用">
              <button onClick={() => onTab('mission')} data-testid="phone-app-messages" aria-label="KIM 任务与消息"><span className="phone-app-icon kim"><img src={KIM_ICON} alt=""/>{m.status === 'offered' && <b className="phone-app-badge">1</b>}</span><span>KIM</span></button>
              <button onClick={() => onTab('wallet')} aria-label="钱包"><span className="phone-app-icon sun"><Coins size={26}/></span><span>钱包</span></button>
              <button onClick={() => onTab('empire')} aria-label="我的版图"><span className="phone-app-icon sky"><Map size={26}/></span><span>版图</span></button>
              <button onClick={onHall} data-testid="town-open-hall" aria-label="员工"><span className="phone-app-icon mint"><Users size={26}/></span><span>员工</span></button>
            </nav>
            <div className="town-phone-pocket"><Coins size={16}/><b>{home.wallet.balance}</b><span>金币</span></div>
          </div>}
          {tab === 'mission' && <div className="town-kim-channel"><b>任务助手</b><span>待办 · {m.status === 'completed' ? '已完成' : '1'}</span></div>}
      {tab === 'mission' && <div className="town-mission" data-testid="town-mission" data-status={m.status}>
        <div className="town-msg">
          <b>街角奶茶 · 店长</b>
          <p>{m.status === 'completed' ? '店救回来了，谢谢你！以后常来。' : '小店快倒闭了，来帮个忙？'}</p>
        </div>
        <h3>救救街角奶茶 <em>{m.status === 'offered' ? '新任务' : m.status === 'accepted' ? '进行中' : '已完成'}</em></h3>
        <ol className="town-steps">
          <li className={m.status !== 'offered' ? 'done' : ''}>接下任务</li>
          <li className={hires > 0 ? 'done' : 'opt'}>雇佣大厅招员工 <small>可选 · 本班 {hires}/2</small></li>
          <li className={m.status === 'completed' ? 'done' : ''}>到店正式营业，赚到钱</li>
        </ol>
        {m.status === 'completed' && <p className="town-income">本次净赚 <b>+{m.income}</b> 金币</p>}
        {m.status === 'completed' && biz && (biz.stage === 'complete'
          ? <div className="town-next done" data-testid="town-business-goal" data-stage={biz.stage}><b>首店篇完成</b><span>继续探索商圈，筹备连锁扩张</span></div>
          : <div className="town-next" data-testid="town-business-goal" data-stage={biz.stage}>
            <small>下一阶段</small><b>{biz.title}</b><span>{biz.goal}</span>
            <div className="tea-progress"><i style={{ width: `${Math.min(100, biz.target ? (biz.progress / biz.target) * 100 : 0)}%` }} /><span>{biz.progress} / {biz.target} {biz.unit}</span></div>
            {biz.reward && <em>回报 · {biz.reward}</em>}
          </div>)}
        {m.status === 'offered'
          ? <div className="town-row">
            <button className="tea-btn primary" disabled={busy} onClick={() => void accept()} data-testid="town-accept-mission">接下任务</button>
            <button className="tea-btn ghost" onClick={onClose}>先逛逛</button>
          </div>
          : <div className="town-row">
            <button className="tea-btn" onClick={() => onGo('recruit')} data-testid="town-go-recruit">去雇佣大厅<small>可选</small></button>
            <button className="tea-btn primary" onClick={() => onGo('shop')} data-testid="town-go-shop">{m.status === 'completed' ? '回店继续经营' : '带路去奶茶店'}</button>
          </div>}
        {err ? <p className="tea-hint bad" role="alert">{err}</p> : toast ? <p className="tea-hint town-phone-toast" role="status">{toast}</p> : null}
      </div>}

      {tab === 'empire' && <EmpirePath home={home} onGo={onGo} />}

      {tab === 'wallet' && <div className="town-wallet" data-testid="town-wallet">
        <div className="town-balance"><span>金币</span><b>{home.wallet.balance}</b></div>
        {home.wallet.entries.length
          ? <ul>{home.wallet.entries.map(e => <li key={e.id}>
            <span>{kindName(e.kind)}<small>{when(e.at)}</small></span>
            <b className={e.delta >= 0 ? 'ok' : 'bad'}>{e.delta >= 0 ? '+' : ''}{e.delta}</b>
          </li>)}</ul>
          : <p className="tea-empty">还没有收支</p>}
      </div>}
        </div>
        <footer className="phone-bottom"><button onClick={() => tab === 'home' ? onClose() : onTab('home')} aria-label={tab === 'home' ? '收起手机' : '返回手机桌面'}><i/></button></footer>
      </div>
    </section>
  </div>;
}

/** 版图：首店站稳 → 考察商圈 → 连锁扩张 → 商业帝国。只展示真实进度；后续章节明确标注筹备中，不放假按钮。 */
function EmpirePath({ home, onGo }: { home: TeaLiveHome; onGo: (site: DestinationId) => void }) {
  const ex = home.exploration;
  const firstShop = ex ? ex.firstShopComplete : home.business?.stage === 'complete';
  const surveyed = !!ex && ex.visited >= ex.total;
  const steps = [
    { key: 'shop', title: '首店站稳', done: firstShop, note: firstShop ? '首店篇完成' : home.business ? `${home.business.title} · ${home.business.progress}/${home.business.target}${home.business.unit}` : '经营街角奶茶' },
    { key: 'survey', title: '考察商圈', done: surveyed, note: ex ? `${ex.visited}/${ex.total} 处 · 已得 ${ex.rewardTotal} 金币` : '数据加载中' },
    { key: 'chain', title: '连锁扩张', done: false, note: ex?.chainReady ? '选址就绪 · 后续章节开放' : '后续章节 · 筹备中' },
    { key: 'empire', title: '商业帝国', done: false, note: '后续章节' },
  ] as const;
  const current = steps.find(s => !s.done)?.key ?? 'empire';
  return <div className="town-empire" data-testid="town-empire-path" data-step={current}>
    <ol className="town-empire-steps">
      {steps.map(s => <li key={s.key} className={s.done ? 'done' : s.key === current ? 'now' : ''}><b>{s.title}</b><small>{s.note}</small></li>)}
    </ol>
    {!firstShop && <button className="tea-btn primary" onClick={() => onGo('shop')}>回店继续经营</button>}
    {ex
      ? <div className="town-sites" data-testid="town-exploration-progress" data-visited={ex.visited} data-total={ex.total}>
        <h4>商圈据点 <em>{ex.visited}/{ex.total}</em></h4>
        <ul>{ex.opportunities.map(o => <li key={o.id} className={o.visitedAt > 0 ? 'done' : ''}>
          <span><b>{o.visitedAt > 0 ? '✓ ' : ''}{o.name}</b><small>{o.visitedAt > 0 ? o.insight : `${o.district === 'commerce' ? '商业区' : '娱乐区'} · 考察 +${o.reward}`}</small></span>
          {o.visitedAt > 0 ? <em>已考察</em> : <button className="tea-btn" onClick={() => onGo(o.id as SiteId)}>带路</button>}
        </li>)}</ul>
        {ex.chainReady && <p className="town-chain-note">连锁选址已就绪，开店玩法在后续章节开放</p>}
      </div>
      : <p className="tea-empty">商圈数据加载中，检查连接后重开手机</p>}
  </div>;
}
