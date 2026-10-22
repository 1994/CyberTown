import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../ui/useDialogFocus.ts';
import type { TeaLiveHome } from '../../shared/teaLive.ts';
import type { DestinationId, SiteId } from '../../shared/townPlan.ts';

// 手机：只有“任务 / 钱包”两页。金币与任务状态全部读 home（服务端权威），这里不记账。
const KIND: Record<string, string> = {
  tea_hold: '开店预付', tea_sales: '营业收入', tea_wage: '打工工资', tea_upgrade: '门店升级',
  tea_cost: '开店成本', tea_opening_grant: '启动金', tea_mission: '救店奖励', town_explore: '商圈考察', town_hire: '员工签约', town_job: '派工收入', town_market_buy: '买入合同', town_market_sell: '转让收入', town_build: '小镇建设',
};
const kindName = (k: string) => KIND[k] ?? (k.startsWith('tea') ? '奶茶店' : '其他');
const when = (at: number) => new Date(at < 1e12 ? at * 1000 : at).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export type PhoneTab = 'mission' | 'empire' | 'wallet';

export function TownPhone({ home, tab, onTab, onClose, onAccept, onGo, onHall, busy, hires, toast }: {
  home: TeaLiveHome; tab: PhoneTab; onTab: (t: PhoneTab) => void; onClose: () => void;
  onAccept: () => Promise<void>; onGo: (site: DestinationId) => void; onHall: () => void; busy: boolean; hires: number; toast?: string;
}) {
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
  return <div className="town-phone-wrap" onPointerDown={e => e.target === e.currentTarget && onClose()}>
    <section ref={box} className="town-phone" data-testid="town-phone" role="dialog" aria-modal="true" aria-label="手机" tabIndex={-1}>
      <header>
        <nav>
          <button className={tab === 'mission' ? 'on' : ''} onClick={() => onTab('mission')}>任务{m.status === 'offered' && <i />}</button>
          <button className={tab === 'empire' ? 'on' : ''} onClick={() => onTab('empire')}>版图</button>
          <button className={tab === 'wallet' ? 'on' : ''} onClick={() => onTab('wallet')}>钱包</button>
          <button className="town-phone-hall" onClick={onHall} data-testid="town-open-hall">员工 ›</button>
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
