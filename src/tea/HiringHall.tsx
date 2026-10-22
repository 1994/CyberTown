import { useEffect, useMemo, useRef, useState } from 'react';
import type { TownCandidate, TownClone, TownEmployeeListing, TownJobKind } from '../../shared/town.ts';
import type { TeaWorker } from '../../shared/tea.ts';
import { useDialogFocus } from '../ui/useDialogFocus.ts';
import { useTownState } from './townState.ts';
import './hall.css';

// 雇佣大厅：候选分身 / 人物详情 / 我的员工。所有金币、报价、职级、派工都来自服务端 TownHome，本地不记账。

const MAX_STAFF = 12;
const LEVEL_TITLE = ['学徒', '学徒', '店员', '经理'];
const JOB: Record<TownJobKind, { name: string; cycle: number; reward: number; need: 1 | 3 }> = {
  clean: { name: '街坊保洁', cycle: 20, reward: 12, need: 1 },
  stock: { name: '邻里补货', cycle: 30, reward: 18, need: 1 },
  manage: { name: '经理巡检', cycle: 60, reward: 60, need: 3 },
  rest: { name: '召回待命', cycle: 0, reward: 0, need: 1 },
};
type Filter = 'all' | 'service' | 'production' | 'adapt';
const FILTER_LABEL: Record<Filter, string> = { all: '全部', service: '擅长接待', production: '擅长制作', adapt: '擅长机动' };
type Sort = 'price' | 'potential';

export const shiftWage = (w: TeaWorker) => Math.ceil(w.salary / 4);
const best = (w: TeaWorker): Exclude<Filter, 'all'> => {
  const m = Math.max(w.service, w.production, w.adaptability);
  return m === w.production ? 'production' : m === w.service ? 'service' : 'adapt';
};
const POTENTIAL: Record<Exclude<Filter, 'all'>, string> = { service: '前台接待', production: '制作出杯', adapt: '机动补位' };
const potentialScore = (w: TeaWorker) => w.service + w.production + w.adaptability;
const ms = (t: number) => (t < 1e12 ? t * 1000 : t);

export function Face({ w, size = 44 }: { w: { name: string; color: string; avatarUrl?: string }; size?: number }) {
  const [bad, setBad] = useState(false);
  return w.avatarUrl && !bad
    ? <img className="hall-face" src={w.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBad(true)} style={{ borderColor: w.color }} />
    : <span className="hall-face mono" style={{ width: size, height: size, background: w.color, fontSize: size * 0.42 }}>{w.name.slice(-1)}</span>;
}

function Stats({ w }: { w: TeaWorker }) {
  return <div className="hall-stats">
    {([['接待', w.service], ['制作', w.production], ['应变', w.adaptability]] as const).map(([k, v]) =>
      <span key={k}><em>{k}</em><b><i style={{ width: `${Math.min(100, v)}%` }} /></b><small>{v}</small></span>)}
  </div>;
}

/** 服务端时钟偏移：倒计时 1s 本地刷新，不额外轮询网络 */
function useServerNow() {
  const serverTime = useTownState(s => s.home?.serverTime ?? 0);
  const offset = useMemo(() => (serverTime ? ms(serverTime) - Date.now() : 0), [serverTime]);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => { setNow(Date.now() + offset); const t = setInterval(() => setNow(Date.now() + offset), 1000); return () => clearInterval(t); }, [offset]);
  return now;
}

function CloneCard({ c, now, busy, fresh, listing, onJob, onList, onWithdraw, onShop }: { c: TownClone; now: number; busy: boolean; fresh: boolean; listing: TownEmployeeListing | null; onJob: (k: TownJobKind) => void; onList: () => void; onWithdraw: () => void; onShop: () => void }) {
  const job = c.job && c.job.status === 'active' ? c.job : null;
  const working = !!job && job.kind !== 'rest';
  const left = job ? Math.max(0, Math.ceil((ms(job.endsAt) - now) / 1000)) : 0;
  const listed = !!c.listingId;
  const pct = c.nextXp > 0 ? Math.min(100, (c.xp / c.nextXp) * 100) : 100;
  return <li className={`hall-clone ${fresh ? 'fresh' : ''} ${listed ? 'listed' : ''}`} data-testid={`hired-clone-${c.id}`} data-level={c.level} data-job={working ? job!.kind : 'rest'} data-listed={listed ? 'true' : undefined}>
    <header>
      <Face w={c} size={40} />
      <div>
        <b>{c.name}</b>
        <span className={`hall-lv lv${c.level}`}>Lv{c.level} {LEVEL_TITLE[c.level] ?? '经理'}</span>
      </div>
      <em className={listed ? 'listed' : working ? 'out' : c.canStaff ? 'ready' : ''}>{listed ? '挂牌中' : working ? '外出派工' : c.canStaff ? '可入店' : '待命'}</em>
    </header>
    <div className="hall-xp" aria-label={`经验 ${c.xp}/${c.nextXp}`}><i style={{ width: `${pct}%` }} /><small>{c.nextXp > 0 ? `${c.xp}/${c.nextXp} XP` : '满级'}</small></div>
    <p className="hall-job">
      {listed
        ? <>交易市场挂牌中{listing ? <> · 标价 <b>{listing.price}</b></> : null}，撤单后才能派工或入店</>
        : working
        ? <>{JOB[job!.kind].name} · <b>{left}s</b> 后 +{job!.reward} 金币 · 本次已赚 {job!.earned}</>
        : c.canStaff ? '待命中，可在奶茶店筹备时选入' : '学徒先做杂活，60XP 升店员'}
    </p>
    <div className="hall-jobs">
      {(['clean', 'stock', 'manage'] as const).map(k => {
        const locked = k === 'manage' && !c.canManage;
        const on = working && job!.kind === k;
        return <button key={k} className={`tea-btn ${on ? 'on' : ''}`} disabled={busy || locked || on || listed} onClick={() => onJob(k)} data-testid={`clone-job-${k}`}
          title={locked ? 'Lv3 经理解锁' : undefined}>
          {JOB[k].name}<small>{locked ? '🔒Lv3' : `+${JOB[k].reward}/${JOB[k].cycle}s`}</small>
        </button>;
      })}
      <button className="tea-btn ghost" disabled={busy || !working || listed} onClick={() => onJob('rest')} data-testid="clone-job-rest">召回</button>
    </div>
    <div className="hall-clone-acts">
      {c.canStaff && !working && !listed && <button className="tea-btn primary" disabled={busy} onClick={onShop} data-testid="clone-to-shop">加入本班 · 去奶茶店</button>}
      {listed
        ? <button className="tea-btn ghost" disabled={busy || !c.listingId} onClick={onWithdraw} data-testid={`clone-withdraw-${c.id}`}>撤单</button>
        : <button className="tea-btn ghost" disabled={busy || working} onClick={onList} data-testid={`clone-list-${c.id}`} title={working ? '先召回再挂牌' : undefined}>挂牌转让</button>}
    </div>
    {!listed && !c.canStaff && <p className="hall-lock">🔒 店员岗位：Lv2（60XP）后召回即可入店</p>}
    {!listed && working && <p className="hall-lock">外出中：召回后才能入店营业或挂牌</p>}
  </li>;
}

type HallTab = 'candidates' | 'staff' | 'market';
const fee = (price: number) => Math.ceil(price * 0.05);

export function HiringHall({ onClose, onChanged, onShop, initialTab = 'candidates' }: { onClose: () => void; onChanged: () => void; onShop: (cloneId: string) => void; initialTab?: HallTab }) {
  const home = useTownState(s => s.home);
  const busy = useTownState(s => s.busy);
  const hire = useTownState(s => s.hire);
  const startJob = useTownState(s => s.startJob);
  const [tab, setTab] = useState<HallTab>(initialTab);
  const list = useTownState(s => s.list);
  const withdraw = useTownState(s => s.withdraw);
  const buy = useTownState(s => s.buy);
  // 挂牌确认：请求 key 每次打开生成，失败重试沿用
  const [listing, setListing] = useState<{ cloneId: string; price: string; key: string } | null>(null);
  const [buyId, setBuyId] = useState<string | null>(null);
  const [buyQuoted, setBuyQuoted] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('price');
  const [pick, setPick] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [quoted, setQuoted] = useState(0);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const now = useServerNow();
  const box = useRef<HTMLElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const confirmIdRef = useRef<string | null>(null);
  const sheetOpen = !!confirmId || !!listing || !!buyId;
  confirmIdRef.current = sheetOpen ? 'open' : null;
  useDialogFocus(box, !sheetOpen);
  useDialogFocus(sheet, sheetOpen);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (confirmIdRef.current) { setConfirmId(null); setListing(null); setBuyId(null); } else onClose(); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  useEffect(() => { if (!success) return; const t = setTimeout(() => setSuccess(null), 3500); return () => clearTimeout(t); }, [success]);

  if (!home) return <div className="hall-wrap"><section className="hall" data-testid="hiring-hall" role="dialog" aria-modal="true" aria-label="雇佣大厅">
    <p className="tea-empty">正在连接你的小镇…</p><button className="tea-btn" onClick={onClose}>回地图</button></section></div>;

  // 确认面板始终读最新服务端报价；与打开时不同则提示“报价已更新”
  const confirm: TownCandidate | null = home.candidates.find(c => c.id === confirmId) ?? null;
  const full = home.clones.length >= MAX_STAFF;
  const shown = home.candidates
    .filter(c => filter === 'all' || best(c) === filter)
    .sort((a, b) => sort === 'price' ? a.price - b.price : potentialScore(b) - potentialScore(a));
  const cur = home.candidates.find(c => c.id === pick) ?? null;

  const submit = async () => {
    if (!confirm || busy) return;
    setErr('');
    try {
      const before = new Set(home.clones.map(c => c.id));
      await hire(confirm.id, confirm.price);
      const added = useTownState.getState().home?.clones.find(c => !before.has(c.id));
      setSuccess(`${confirm.name} 入职！可立即派工`);
      setFresh(added?.id ?? null);
      setConfirmId(null);
      setTab('staff');
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '雇佣失败，请重试');
      // 报价可能已被别人推高：拉一次权威 home 让确认面板显示新价
      void useTownState.getState().refresh().catch(() => undefined);
    }
  };
  const run = async (fn: () => Promise<void>, ok: string, done?: () => void) => {
    setErr('');
    try { await fn(); setSuccess(ok); done?.(); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : '操作失败，请重试'); void useTownState.getState().refresh().catch(() => undefined); }
  };
  // 整数校验：不偷偷取整改价
  const listPrice = listing ? Number(listing.price) : 0;
  const listValid = Number.isInteger(listPrice) && listPrice >= 10 && listPrice <= 100000;
  const buyItem = home.market.find(m => m.listingId === buyId) ?? null;
  // 同源判定按 sourceId（候选 id），不能用 playerId（系统员工 playerId 为空）
  const ownsSource = (m: TownEmployeeListing) => !!home.candidates.find(c => c.id === m.sourceId)?.owned;
  const buyBlock = (m: TownEmployeeListing) => m.seller.id === home.owner.id ? '这是你的挂牌' : m.sourceId === `employee:${home.owner.id}` ? '这是你本人的分身' : ownsSource(m) ? '已有同源员工' : full ? `员工已满 ${MAX_STAFF} 位` : home.coins < m.price ? '金币不足' : '';
  const job = async (c: TownClone, k: TownJobKind) => {
    setErr('');
    try { await startJob(c.id, k); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : '派工失败，请重试'); }
  };

  const detail = cur && <section className="hall-detail" data-testid="hire-detail" aria-label={`${cur.name}详情`}>
    <button className="hall-back" onClick={() => setPick(null)} aria-label="返回候选列表">← 列表</button>
    <header><Face w={cur} size={72} /><div><b>{cur.name}</b>{cur.demo && <i className="hall-demo">演示</i>}
      <span>适合 · {POTENTIAL[best(cur)]}</span></div></header>
    <Stats w={cur} />
    <dl className="hall-facts">
      <dt>雇佣价</dt><dd className="price">{cur.price} 金币</dd>
      <dt>全服已雇</dt><dd>{cur.hireCount} 份 · 每多一份 +25%</dd>
      <dt>入店每班工资</dt><dd>{shiftWage(cur)} 金币</dd>
      <dt>你的金币</dt><dd>{home.coins}</dd>
    </dl>
    <ol className="hall-ladder">
      <li className="now"><b>Lv1 学徒</b><span>街坊保洁、邻里补货</span></li>
      <li><b>Lv2 店员</b><span>60XP · 奶茶店收银/制作/机动</span></li>
      <li><b>Lv3 经理</b><span>180XP · 经理巡检、店内自动补位</span></li>
    </ol>
    {cur.owned
      ? <p className="hall-owned">已是你的员工</p>
      : <button className="tea-btn primary hall-hire" data-testid="hire-open-confirm" disabled={busy || full || !cur.enabled || home.coins < cur.price}
        onClick={() => { setErr(''); setQuoted(cur.price); setConfirmId(cur.id); }}>雇佣 {cur.price} 金币</button>}
    {!cur.owned && !cur.enabled && <p className="tea-hint bad">暂未开放签约</p>}
    {!cur.owned && full && <p className="tea-hint bad">员工已满 {MAX_STAFF} 位</p>}
    {!cur.owned && !full && home.coins < cur.price && <p className="tea-hint bad">金币不足：还差 {cur.price - home.coins}</p>}
  </section>;

  return <div className="hall-wrap" onPointerDown={e => e.target === e.currentTarget && !confirm && onClose()}>
    <section ref={box} className="hall" data-testid="hiring-hall" data-view={tab === 'candidates' && cur ? 'detail' : tab}
      role="dialog" aria-modal="true" aria-label="雇佣大厅" tabIndex={-1} inert={sheetOpen}>
      <header className="hall-top">
        <div className="hall-title"><small>你的小镇</small><b>雇佣大厅</b></div>
        <nav className="hall-tabs">
          <button className={tab === 'candidates' ? 'on' : ''} onClick={() => setTab('candidates')} data-testid="hiring-tab" data-tab="candidates">候选分身</button>
          <button className={tab === 'staff' ? 'on' : ''} onClick={() => setTab('staff')} data-testid="hiring-tab" data-tab="staff">我的员工 <em data-testid="town-hall-capacity">{home.clones.length}/{MAX_STAFF}</em></button>
          <button className={tab === 'market' ? 'on' : ''} onClick={() => setTab('market')} data-testid="hiring-tab" data-tab="market">交易市场 <em>{home.market.filter(m => m.status === 'active').length}</em></button>
        </nav>
        <span className="hall-coins"><i className="coin sm" />{home.coins}</span>
        <button className="town-x" onClick={onClose} aria-label="关闭雇佣大厅" data-testid="hiring-close">×</button>
      </header>
      {success && <p className="hall-success" role="status" data-testid="hire-success">✓ {success}</p>}
      {err && <p className="hall-error" role="alert" data-testid="hire-error">{err}<button onClick={() => setErr('')}>知道了</button></p>}

      {tab === 'market' ? <div className="hall-body hall-market">
        <section aria-label="在售员工合同">
          <h3>在售合同 <small>转让后等级与经验保留</small></h3>
          {home.market.filter(m => m.status === 'active').length
            ? <ul className="hall-list">{home.market.filter(m => m.status === 'active').map(m => {
              const block = buyBlock(m);
              return <li key={m.listingId} className="hall-listing" data-testid={`market-listing-${m.listingId}`}>
                <Face w={m} size={44} />
                <span className="hall-cand-main"><b>{m.name} <i className={`hall-lv lv${m.level}`}>Lv{m.level} {LEVEL_TITLE[m.level] ?? '经理'}</i></b>
                  <small>{m.seller.id === home.owner.id ? '我的挂牌' : `卖家 ${m.seller.name}`} · {m.xp}XP · 每班 {shiftWage(m)}</small></span>
                <span className="hall-cand-price"><b>{m.price}</b>
                  <button className="tea-btn primary" disabled={busy || !!block} title={block || undefined}
                    onClick={() => { setErr(''); setBuyQuoted(m.price); setBuyId(m.listingId); }} data-testid={`market-buy-${m.listingId}`}>{block || '购买'}</button></span>
              </li>;
            })}</ul>
            : <p className="tea-empty">暂时没有在售合同</p>}
        </section>
        <section aria-label="我的挂牌与记录">
          <h3>我的挂牌与记录</h3>
          {home.trades.length
            ? <ul className="hall-trades" data-testid="market-history">{home.trades.map(t => <li key={t.listingId} data-testid={`market-trade-${t.listingId}`} data-status={t.status}>
              <Face w={t} size={32} />
              <span><b>{t.name}</b><small>{t.status === 'active' ? `挂牌中 · ${t.price}` : t.status === 'sold' ? (t.seller.id === home.owner.id ? `已售出 +${t.proceeds}（手续费 ${t.fee}）` : `已买入 −${t.price}`) : '已撤单'}</small></span>
              {t.status === 'active' && t.seller.id === home.owner.id
                ? <button className="tea-btn ghost" disabled={busy} onClick={() => void run(() => withdraw(t.listingId), `${t.name} 已撤单`)} data-testid={`market-withdraw-${t.listingId}`}>撤单</button>
                : <em className={t.status}>{t.status === 'sold' ? '成交' : t.status === 'cancelled' ? '撤单' : ''}</em>}
            </li>)}</ul>
            : <p className="tea-empty">还没有交易记录。在“我的员工”里召回后可挂牌转让。</p>}
        </section>
      </div> :
      <div className={`hall-body tab-${tab} ${cur ? 'has-detail' : ''}`}>
        <section className="hall-candidates" aria-label="候选分身">
          <div className="hall-tools">
            {(Object.keys(FILTER_LABEL) as Filter[]).map(f => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)} data-testid="hire-filter" data-filter={f}>{FILTER_LABEL[f]}</button>)}
            <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="排序">
              <option value="price">按价格</option><option value="potential">按潜力</option>
            </select>
          </div>
          <ul className="hall-list">
            {shown.map(c => <li key={c.id}>
              <button className={`hall-cand ${pick === c.id ? 'on' : ''} ${c.owned ? 'owned' : ''}`} onClick={() => setPick(c.id)}
                data-testid={`hire-candidate-${c.id}`} data-owned={c.owned ? 'true' : undefined} aria-pressed={pick === c.id}>
                <Face w={c} size={44} />
                <span className="hall-cand-main"><b>{c.name}</b><small>{POTENTIAL[best(c)]} · 每班 {shiftWage(c)}</small></span>
                <span className="hall-cand-price">{c.owned ? <em>已雇佣</em> : <><b>{c.price}</b><small>已雇 {c.hireCount}</small></>}</span>
              </button>
            </li>)}
            {!shown.length && <li className="tea-empty">没有符合的候选</li>}
          </ul>
        </section>
        {detail || <section className="hall-detail empty"><p>选一位候选分身查看能力与价格</p></section>}
        <section className="hall-staff" aria-label="我的员工">
          <h3>我的员工 <em>{home.clones.length}/{MAX_STAFF}</em></h3>
          {home.clones.length
            ? <ul>{home.clones.map(c => <CloneCard key={c.id} c={c} now={now} busy={busy} fresh={fresh === c.id}
              listing={home.trades.find(t => t.listingId === c.listingId) ?? home.market.find(t => t.listingId === c.listingId) ?? null}
              onJob={k => void job(c, k)} onShop={() => onShop(c.id)}
              onList={() => { setErr(''); setListing({ cloneId: c.id, price: String(Math.max(10, c.hiredPrice || 120)), key: crypto.randomUUID() }); }}
              onWithdraw={() => c.listingId && void run(() => withdraw(c.listingId!), `${c.name} 已撤单，回到待命`)} />)}</ul>
            : <p className="tea-empty">还没有员工。雇一位学徒派去杂活，升到 Lv2 就能入店。</p>}
        </section>
      </div>}
    </section>

    {listing && (() => {
      const cl = home.clones.find(c => c.id === listing.cloneId);
      if (!cl) return null;
      return <div className="hall-confirm-wrap">
        <section ref={sheet} className="hall-confirm tea-sheet" role="dialog" aria-modal="true" aria-label="挂牌转让" data-testid="market-list-confirm" tabIndex={-1}>
          <header><Face w={cl} size={48} /><div><small>挂牌转让 · Lv{cl.level} {cl.xp}XP</small><b>{cl.name}</b></div></header>
          <label className="hall-price-input">标价（10–100000 金币）
            <input type="number" inputMode="numeric" min={10} max={100000} step={10} value={listing.price}
              onChange={e => setListing({ ...listing, price: e.target.value })} data-testid="market-price" /></label>
          <dl className="tea-slip">
            <dt>成交手续费 5%</dt><dd className="bad">−{listValid ? fee(listPrice) : 0}</dd>
            <dt>成交后到手</dt><dd className="ok">+{listValid ? listPrice - fee(listPrice) : 0}</dd>
          </dl>
          <p className="hall-note">挂牌期间不能派工或入店；随时可撤单。成交后员工转入买家小镇，等级经验保留。</p>
          {err && <p className="tea-hint bad" role="alert">{err}</p>}
          <div className="tea-sheet-actions">
            <button className="tea-btn ghost" disabled={busy} onClick={() => setListing(null)}>取消</button>
            <button className="tea-btn primary" disabled={busy || !listValid} data-testid="market-list-submit"
              onClick={() => void run(() => list(cl.id, listPrice, listing.key), `${cl.name} 已挂牌 ${listPrice}`, () => { setListing(null); setTab('market'); })}>
              {busy ? '挂牌中…' : err ? '重试挂牌' : `挂牌 ${listValid ? listPrice : ''}`}</button>
          </div>
        </section>
      </div>;
    })()}

    {buyId && (buyItem
      ? <div className="hall-confirm-wrap">
        <section ref={sheet} className="hall-confirm tea-sheet" role="dialog" aria-modal="true" aria-label="购买员工合同" data-testid="market-buy-confirm" tabIndex={-1}>
          <header><Face w={buyItem} size={48} /><div><small>买入合同 · 卖家 {buyItem.seller.name}</small><b>{buyItem.name}</b></div></header>
          <dl className="tea-slip">
            <dt>合同价</dt><dd className="bad">−{buyItem.price}</dd>
            <dt>买入后金币</dt><dd>{home.coins - buyItem.price}</dd>
            <dt>保留</dt><dd>Lv{buyItem.level} {LEVEL_TITLE[buyItem.level] ?? '经理'} · {buyItem.xp}XP</dd>
            <dt>入店每班工资</dt><dd>{shiftWage(buyItem)} / 班</dd>
          </dl>
          {buyItem.price !== buyQuoted && <p className="tea-hint bad">价格已变动：{buyQuoted} → {buyItem.price}</p>}
          {buyBlock(buyItem) && <p className="tea-hint bad">{buyBlock(buyItem)}</p>}
          {err && <p className="tea-hint bad" role="alert">{err}</p>}
          <div className="tea-sheet-actions">
            <button className="tea-btn ghost" disabled={busy} onClick={() => setBuyId(null)}>取消</button>
            <button className="tea-btn primary" disabled={busy || !!buyBlock(buyItem)} data-testid="market-buy-submit"
              onClick={() => void run(() => buy(buyItem.listingId, buyItem.price), `${buyItem.name} 加入你的小镇`, () => { setBuyId(null); setTab('staff'); })}>
              {busy ? '购买中…' : err ? `重试 · ${buyItem.price}` : `确认买入 ${buyItem.price} 金币`}</button>
          </div>
        </section>
      </div>
      : <div className="hall-confirm-wrap"><section ref={sheet} className="hall-confirm tea-sheet" role="dialog" aria-modal="true" aria-label="合同已下架" tabIndex={-1}>
        <p>这份合同已成交或撤单。</p>
        <div className="tea-sheet-actions"><button className="tea-btn" onClick={() => setBuyId(null)}>知道了</button></div>
      </section></div>)}

    {confirm && <div className="hall-confirm-wrap">
      <section ref={sheet} className="hall-confirm tea-sheet" role="dialog" aria-modal="true" aria-label="确认雇佣" data-testid="hire-confirm" tabIndex={-1}>
        <header><Face w={confirm} size={48} /><div><small>签约雇佣</small><b>{confirm.name}</b></div></header>
        <dl className="tea-slip">
          <dt>签约费</dt><dd className="bad">−{confirm.price}</dd>
          <dt>雇佣后金币</dt><dd>{home.coins - confirm.price}</dd>
          <dt>入店每班工资</dt><dd>{shiftWage(confirm)} / 班</dd>
        </dl>
        {confirm.price !== quoted && <p className="tea-hint bad" data-testid="hire-price-changed">报价已更新：{quoted} → {confirm.price}</p>}
        <p className="hall-note">签约后成为本镇员工（独立分身，不占用别人的）：可派工、入店，也可在交易市场挂牌转让；入店营业时每班另付工资。</p>
        {err && <p className="tea-hint bad" role="alert">{err}</p>}
        <div className="tea-sheet-actions">
          <button className="tea-btn ghost" disabled={busy} onClick={() => setConfirmId(null)}>再想想</button>
          <button className="tea-btn primary" disabled={busy || home.coins < confirm.price} onClick={() => void submit()} data-testid="hire-confirm-submit">
            {busy ? '雇佣中…' : err ? `重试 · ${confirm.price} 金币` : `确认雇佣 ${confirm.price} 金币`}</button>
        </div>
      </section>
    </div>}
  </div>;
}
