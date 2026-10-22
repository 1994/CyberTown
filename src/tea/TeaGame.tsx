import { useLayoutEffect, useRef, useState } from 'react';
import type { TeaRole, TeaRun, TeaSkill, TeaStrategy, TeaWorker } from '../../shared/tea.ts';
import type { TeaWorkRole } from '../../shared/teaLive.ts';
import { useGame } from '../store.ts';
import { SoundMenu } from '../ui/SoundControl.tsx';
import type { TeaChapterController } from './useTeaChapter.ts';
import { TeaScene } from './TeaScene.tsx';
import '../sound.css';
import './tea.css';

// 店内视图：状态、计时、请求、音频都在 TownGame 持有的 controller 里；这里只负责美术与交互呈现。
// 营业中的出杯/收入全部来自服务端逐步计算的 session，本组件不伪造任何结果。

const ROLE: Record<TeaRole, string> = { cashier: '前台', maker: '制作', support: '机动' };
const STRATEGY: Record<TeaStrategy, string> = { balanced: '均衡', speed: '快出杯', service: '用心服务' };
const SKILL: Record<TeaSkill, [string, string]> = {
  none: ['无技能', '只按三项属性发挥'],
  batch_master: ['批量大师', '连续制作 5 杯后，接下来 3 杯耗时 -20%'],
  golden_service: ['金牌服务', '在前台时，排队顾客耐心消耗 -15%'],
  rescue_captain: ['救场队长', '机动岗队列≥6 持续 5 秒，支援耗时 -20%'],
  materials_saver: ['省料达人', '制作每杯只消耗 0.9 份原料'],
  steady_hand: ['稳手', '抵消高峰期的出杯减速'],
};
const STOCKS = [60, 80, 100] as const;
const RESCUE_STOCKS = [20, 40, 60] as const;
// 首章教学客流（solo/duo 试营业的到店人数，正式高峰取 challenge.arrivals）
const SOLO_ARRIVALS = 8, DUO_ARRIVALS = 18;
const LEVEL_NAME = ['街角奶茶', '霓虹奶茶', '夜城茶饮旗舰'];
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const specialty = (w: TeaWorker) => {
  const m = Math.max(w.service, w.production, w.adaptability);
  return m === w.production ? '擅长制作' : m === w.service ? '擅长接待' : '擅长机动';
};

function ServedCurve({ run }: { run: TeaRun }) {
  const f = run.result.frames;
  if (f.length < 2) return null;
  const W = 300, H = 90;
  const maxY = Math.max(run.challenge.target, ...f.map(x => x.served), 1) * 1.08;
  const dur = Math.max(run.challenge.duration, f[f.length - 1].t, 1);
  const pts = f.map(x => `${((x.t / dur) * W).toFixed(1)},${(H - (x.served / maxY) * H).toFixed(1)}`).join(' ');
  const ty = H - (run.challenge.target / maxY) * H;
  return <figure className="tea-curve">
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="累计出杯曲线">
      <line x1="0" x2={W} y1={ty} y2={ty} className="target" />
      <polyline points={`0,${H} ${pts} ${W},${H}`} className="area" />
      <polyline points={pts} className="line" />
    </svg>
    <figcaption><span>累计出杯</span><span>目标 {run.challenge.target}</span><span>{fmtTime(dur)}</span></figcaption>
  </figure>;
}

function Stat({ label, v }: { label: string; v: number }) {
  return <div className="tea-stat"><span>{label}</span><b><i style={{ width: `${Math.min(100, v)}%` }} /></b><em>{v}</em></div>;
}

/** 招募卡：默认只露名字 / 专长 / 工资；属性与技能点“详情”展开。 */
export function WorkerCard({ w, on, onClick, disabled }: { w: TeaWorker; on: boolean; onClick: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [sk, desc] = SKILL[w.skill] ?? SKILL.none;
  return <div className={`tea-card ${on ? 'on' : ''} ${disabled ? 'off' : ''}`} style={{ '--c': w.color } as React.CSSProperties}>
    <button className="tea-card-main" onClick={onClick} disabled={disabled} aria-pressed={on}>
      <header><b>{w.name}</b>{w.demo && <i>演示</i>}<span>¥{w.salary}</span></header>
      <p className="tea-spec">{specialty(w)}{w.skill !== 'none' && <em> · {sk}</em>}</p>
    </button>
    <button className="tea-card-more" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? '收起' : '详情'}</button>
    {open && <div className="tea-card-detail">
      <Stat label="服务" v={w.service} /><Stat label="制作" v={w.production} /><Stat label="应变" v={w.adaptability} />
      <small>{desc}</small>{!w.enabled && <small>今日未开放</small>}
    </div>}
  </div>;
}

export function TeaGame({ controller: c, onExit, onPhone }: { controller: TeaChapterController; onExit: () => void; onPhone: () => void }) {
  const me = useGame(s => s.snapshot?.me);
  const { home, team, frame, run } = c;
  // 招募在广场完成；店里只有筹备/营业/报告，controller 若仍停在 street 也按筹备呈现
  const view = c.view === 'street' ? 'prep' : c.view;
  const [drawer, setDrawer] = useState<'none' | 'history' | 'notices'>('none');
  const [confirmPay, setConfirmPay] = useState(false);

  // 3D 只画在面板/底部操作条以外的可用区域
  const rootRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ top: 0, right: 0, bottom: 0 });
  const ready = !!home;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      const bottomOf = (sel: string) => (root.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect().bottom ?? box.top;
      const top = Math.max(0, Math.max(bottomOf('.tea-top'), bottomOf('.tea-guide'), bottomOf('.tea-live')) - box.top);
      let right = 0, bottom = 0;
      root.querySelectorAll<HTMLElement>('.tea-panel, .tea-dock').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > box.width * 0.6) bottom = Math.max(bottom, box.bottom - r.top + 6);
        else right = Math.max(right, box.right - r.left + 6);
      });
      setStage(s => (s.top === top && s.right === right && s.bottom === bottom ? s : { top, right, bottom }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    root.querySelectorAll('.tea-panel, .tea-top, .tea-guide, .tea-dock, .tea-live').forEach(el => ro.observe(el));
    return () => ro.disconnect();
  }, [view, ready]);

  if (!home) return <div className="tea-root tea-loading">
    {c.error ? <div className="tea-error"><p>{c.error}</p><button className="tea-btn primary" onClick={() => void c.load()}>重试</button>
      <button className="tea-btn ghost" onClick={() => void c.logout()}>退出登录</button></div>
      : <div className="tea-spin"><i />霓虹奶茶店开门中…</div>}
  </div>;

  const self = home.self;
  const ch = home.challenge;
  const lv = home.shop.level;
  const live = view === 'play';
  const hires = team.filter(w => w.id !== self.id);
  const rescue = c.lesson === 'rescue';
  const official = rescue || c.lesson === 'rush' || c.lesson === 'free';
  const passed = home.shop.best >= ch.target || home.mission.status === 'completed';
  const st = frame?.selfTask;
  const queueOf = (s: 'cashier' | 'maker') => frame?.customersState.filter(x => x.state === s).length ?? 0;
  // 指派按钮始终在位：只在已排下一批或该端无积压时禁用（不随请求 busy 闪烁/卸载）
  const queued = !!st?.queuedRole;
  const canDo = (r: TeaWorkRole) => live && !queued && queueOf(r) > 0;
  // 有同事负责的岗位只在队列≥6 时强调，避免每杯都催自己
  const covered = (r: TeaWorkRole) => !!frame?.workersState.some(w => w.id !== self.id && w.role === r);
  const urgent = (r: TeaWorkRole) => canDo(r) && (!covered(r) || queueOf(r) >= 6);
  const assign = (r: TeaWorkRole) => { if (!c.busy && canDo(r)) void c.assign(r); };
  // 报告/历史固定用该 run 的阵容与岗位演出，不用当前筹备队伍
  const showTeam = run && view !== 'prep' ? run.workers : team;
  const showRoles = run && view !== 'prep' ? Object.fromEntries(run.plan.assignments.map(a => [a.workerId, a.role])) as Record<string, TeaRole> : c.roles;
  const res = run?.result;
  const duration = run?.challenge.duration ?? ch.duration;
  // 与 controller.next() 的分支一一对应
  const chStage = home.chapter.stage;
  const nextLabel = rescue ? '再开一班' : c.lesson === 'solo' ? (chStage === 'solo' ? '再试一次' : '去招第一位同事')
    : c.lesson === 'duo' ? (chStage === 'duo' ? '再试一次' : '去招第二位同事')
      : chStage === 'upgrade' ? '去升级门店' : c.lesson === 'rush' ? '调整再战' : '继续经营';

  return <div ref={rootRef} className={`tea-root view-${view}`}>
    <div className="tea-stage" style={{ top: stage.top, right: stage.right, bottom: stage.bottom }}>
      <TeaScene view="shop" shop={{ level: lv, team: showTeam, roles: showRoles, frame, stockMax: run?.plan.stock ?? c.stock, events: c.events,
        supportAt: c.supportAt, selfAvatar: me?.avatarUrl, live, liveFrame: live ? frame : null, onAssign: assign,
        canAssign: live && !queued, selfId: self.id }} />
    </div>

    <header className="tea-top">
      <button className="tea-btn ghost tea-exit" onClick={onExit} aria-label="回到小镇地图" data-testid="town-exit-shop">← 小镇</button>
      <div className="tea-brand tea-shopname">{LEVEL_NAME[lv - 1] ?? '奶茶店'}</div>
      <div className="tea-wallet" title="真实金币余额"><span>金币</span><b>{home.wallet.balance}</b></div>
      <div className="tea-actions">
        <SoundMenu className="tea-sound" />
        <button className="tea-icon" onClick={onPhone} aria-label="手机：任务与钱包">手机{home.mission.status === 'offered' && <i>1</i>}</button>
        <button className="tea-icon" disabled={live} onClick={() => setDrawer(drawer === 'history' ? 'none' : 'history')} aria-label="历史报告">历史</button>
        <button className="tea-icon" onClick={() => setDrawer(drawer === 'notices' ? 'none' : 'notices')} aria-label="受雇通知">
          通知{home.notices.length > 0 && <i>{home.notices.length}</i>}</button>
      </div>
    </header>

    {view === 'prep' && <div className="tea-guide">
      <p><b>{c.goal}</b></p>
      <ol className="tea-crew" aria-label={`同事 ${hires.length}/2`}>{[0, 1].map(i =>
        <li key={i} className={i < hires.length ? 'done' : ''} />)}</ol>
    </div>}

    {view === 'prep' && <section className="tea-panel tea-prep">
      <div className="tea-block">
        {team.map(w => <div key={w.id} className="tea-assign" style={{ '--c': w.color } as React.CSSProperties}>
          <b>{w.id === self.id ? '你' : w.name}</b><span className="tea-mini">{w.id === self.id ? '半自动 · 指派批次' : '全自动'}</span>
          {team.length > 1 && <div className="tea-seg">{(Object.keys(ROLE) as TeaRole[]).map(r =>
            <button key={r} className={c.roles[w.id] === r ? 'on' : ''} onClick={() => c.setRole(w.id, r)}>{ROLE[r]}</button>)}</div>}
        </div>)}
      </div>
      {official && <div className="tea-block tea-grid2">
        <div><h3>备货</h3><div className="tea-seg">{(rescue ? RESCUE_STOCKS : STOCKS).map(s => <button key={s} className={c.stock === s ? 'on' : ''}
          onClick={() => c.setStock(s as Parameters<typeof c.setStock>[0])}>{s}</button>)}</div></div>
        <div><h3>策略</h3><div className="tea-seg">{(Object.keys(STRATEGY) as TeaStrategy[]).map(s =>
          <button key={s} className={c.strategy === s ? 'on' : ''} onClick={() => c.setStrategy(s)}>{STRATEGY[s]}</button>)}</div></div>
      </div>}
      {official && <div className={`tea-meter ${c.totalCost > ch.budget ? 'over' : ''}`}><i style={{ width: `${Math.min(100, (c.totalCost / ch.budget) * 100)}%` }} />
        <span>成本 ¥{c.totalCost} / 预算 ¥{ch.budget}</span></div>}
      {hires.length === 0 && <p className="tea-hint">没帮手也能开，招人去广场</p>}
      {rescue && home.mission.status === 'offered' && <div className="tea-row tea-mission-gate">
        <button className="tea-btn" disabled={c.busy} onClick={() => void c.acceptMission()} data-testid="town-accept-mission">接任务</button>
      </div>}
      {c.problems.map(p => <p key={p} className="tea-hint bad">{p}</p>)}
      {(home.chapter.stage === 'upgrade' || home.chapter.stage === 'complete' || c.lesson === 'free' || rescue) && lv < 3 && <div className="tea-upgrade">
        <span>门店 Lv.{lv}</span>
        {passed
          ? <button className="tea-btn ghost" disabled={c.busy || home.wallet.balance < home.shop.nextUpgradeCost} onClick={() => void c.upgrade()}>升级 ¥{home.shop.nextUpgradeCost}</button>
          : <span className="tea-lock"><button className="tea-btn ghost" disabled>升级 ¥{home.shop.nextUpgradeCost}</button><small>{rescue ? '救店成功后解锁' : '正式达标后解锁'}</small></span>}
      </div>}
      <div className="tea-row tea-cta">
        <button className={`tea-btn ${official ? '' : 'primary'}`} disabled={!!c.problems.length || c.busy} onClick={() => void c.start('practice')}>免费试营业</button>
        {official && (confirmPay
          ? <button className="tea-btn primary hot" disabled={c.busy} onClick={() => { setConfirmPay(false); void c.start('official'); }}>预付 ¥{c.totalCost} 开店</button>
          : <button className="tea-btn primary" disabled={!!c.problems.length || c.busy || home.attemptsRemaining <= 0 || home.wallet.balance < c.totalCost}
            onClick={() => setConfirmPay(true)}>正式开店 <small>剩 {home.attemptsRemaining}</small></button>)}
      </div>
    </section>}

    {live && frame && <>
      <div className="tea-live">
        <div className="tea-clock"><b>{fmtTime(frame.t)}</b><i style={{ width: `${(frame.t / duration) * 100}%` }} /></div>
        <div className={`tea-kpis n${run?.mode === 'practice' ? 4 : 3}`}>
          <span className="ok"><em>出杯</em>{frame.served}<small>/{run?.challenge.target ?? ch.target}</small></span>
          <span className="bad"><em>流失</em>{frame.lost}</span>
          <span className={frame.stock <= 5 && frame.cashierQueue + frame.makerQueue > 0 ? 'bad' : ''}><em>原料</em>{Math.max(0, Math.round(frame.stock))}</span>
          {run?.mode === 'practice' && <span className="tea-mode"><em>无结算</em>试营业</span>}
        </div>
      </div>
      <div className="tea-dock">
        <p className="tea-goal">{c.goal}</p>
        <div className="tea-self">
          <b>你</b><span>{!st || st.role === 'idle' ? '待命' : `${st.role === 'cashier' ? '接待' : '制作'}中 ${st.done}/${Math.min(3, st.done + st.remaining)}`}
            {st?.queuedRole ? ` · 下一批${st.queuedRole === 'cashier' ? '接待' : '制作'}` : ''}</span>
        </div>
        <div className="tea-assign-btns">
          {(['cashier', 'maker'] as const).map(r => <button key={r} className={`tea-btn ${urgent(r) ? 'primary' : ''}`} disabled={!canDo(r)} onClick={() => assign(r)}>
            {queued && st?.queuedRole === r ? '下一批已排' : r === 'cashier' ? '接待一批' : '制作一批'}<small>{queueOf(r)}</small></button>)}
        </div>
        <div className="tea-speed">
          <button onClick={c.togglePause} aria-pressed={c.paused}>{c.paused ? '继续' : '暂停'}</button>
          <button className={c.speed === 1 ? 'on' : ''} onClick={() => c.setSpeed(1)}>x1</button>
          <button className={c.speed === 2 ? 'on' : ''} onClick={() => c.setSpeed(2)}>x2</button>
          <button disabled={c.busy} onClick={() => void c.skip()}>跳过 ⏭</button>
        </div>
      </div>
    </>}

    {view === 'report' && res && run && <section className="tea-panel tea-report">
      <div className="tea-big"><b>{res.completed}</b><span>/ {run.challenge.target} 杯</span>
        {run.mode === 'practice'
          ? <em className="tea-nosettle">试营业 · 无结算</em>
          : <em className="ok"><small>本次到账（成本已预付）</small>+¥{res.revenue + res.bonus}</em>}</div>
      {run.mode === 'official' && <p className={`tea-net ${res.profit + res.bonus >= 0 ? 'ok' : 'bad'}`}>净收益 {res.profit + res.bonus >= 0 ? '+' : ''}¥{res.profit + res.bonus}</p>}
      {rescue && run.mode === 'official' && home.mission.runId === run.id && <p className="tea-net ok tea-rescued">✓ 救店任务完成</p>}
      <div className="tea-cause"><b>{res.bottleneck}</b></div>
      <div className="tea-row">
        <button className="tea-btn ghost" onClick={onExit}>回小镇</button>
        <button className="tea-btn primary tea-next-btn" disabled={c.busy} onClick={c.next}>{nextLabel} →</button>
      </div>
      <details className="tea-more"><summary>详细报告</summary>
        <p className="tea-suggest">{res.suggestion}</p>
        <ServedCurve run={run} />
        <div className="tea-loss">
          <span>前台流失 <b>{res.lostCashier}</b></span><span>制作流失 <b>{res.lostMaker}</b></span>{res.lostStock > 0 && <span>缺货流失 <b>{res.lostStock}</b></span>}
          <span>前台平均等待 <b>{res.avgCashierWait.toFixed(1)}s</b></span><span>制作平均等待 <b>{res.avgMakerWait.toFixed(1)}s</b></span>
          <span>剩余原料 <b>{res.stockLeft.toFixed(1)}</b></span>
        </div>
        {run.mode === 'official' && <dl className="tea-ledger"><dt>营收</dt><dd>¥{res.revenue}</dd><dt>工资</dt><dd>-¥{res.wages}</dd>
          <dt>原料</dt><dd>-¥{res.materialCost}</dd><dt>运营</dt><dd>-¥{res.operatingCost}</dd><dt>净利润</dt><dd>¥{res.profit}</dd>
          {res.bonus > 0 && <><dt>达标奖</dt><dd>+¥{res.bonus}</dd></>}<dt>结算后钱包</dt><dd>¥{run.coinsAfter}</dd></dl>}
        <div className="tea-skills">{Object.entries(res.skillCounts).filter(([, v]) => v > 0).map(([k, v]) =>
          <i key={k}>{SKILL[k as TeaSkill]?.[0] ?? '技能'} ×{v}</i>)}</div>
      </details>
    </section>}

    {view === 'ending' && rescue && <section className="tea-panel tea-report tea-ending">
      <h2>{lv >= 3 ? '旗舰开张' : '小店焕新'}</h2>
      <p className="tea-ending-sub">街角奶茶重新开张，回小镇继续探索</p>
      <div className="tea-records">
        <span><em>门店</em><b>Lv.{lv}</b>{LEVEL_NAME[lv - 1] ?? ''}</span>
        {home.mission.status === 'completed' && <span><em>救店净赚</em><b>+{home.mission.income}</b>金币</span>}
        {run && run.mode === 'official' && <span><em>本班出杯</em><b>{run.result.completed}</b>杯</span>}
      </div>
      <div className="tea-row">
        {lv < 3 && <button className="tea-btn ghost" disabled={c.busy || home.wallet.balance < home.shop.nextUpgradeCost}
          onClick={() => void c.upgrade()}>{lv === 1 ? '焕新小店' : '升级旗舰'} ¥{home.shop.nextUpgradeCost}</button>}
        <button className="tea-btn ghost" onClick={onExit}>回小镇</button>
        <button className="tea-btn primary" onClick={c.next}>继续营业 →</button>
      </div>
    </section>}

    {view === 'ending' && !rescue && <section className="tea-panel tea-report tea-ending">
      <h2>{lv >= 3 && passed ? '主线完成' : chStage === 'upgrade' ? '正式达标！' : '同事接管日常'}</h2>
      <p className="tea-ending-sub">{lv >= 3 && passed ? '夜城茶饮旗舰已开张' : chStage === 'upgrade' ? '用这次收益焕新门店，完成第一章' : '从一个人忙，到店自己转起来'}</p>
      <div className="tea-records">
        <span><em>独自</em><b>{home.chapter.soloBest}</b>/ {SOLO_ARRIVALS} 位</span>
        <span><em>1 位同事</em><b>{home.chapter.duoBest}</b>/ {DUO_ARRIVALS} 位</span>
        <span><em>2 位同事</em><b>{home.shop.best}</b>/ {ch.arrivals} 位</span>
      </div>
      <p className="tea-records-note">本章客流逐段增加</p>
      <div className="tea-row">
        {lv < 3 && <button className={`tea-btn ${chStage === 'upgrade' ? 'primary' : 'ghost'}`} disabled={c.busy || home.wallet.balance < home.shop.nextUpgradeCost}
          onClick={() => void c.upgrade()}>{lv === 1 ? '焕新小店' : '升级旗舰'} ¥{home.shop.nextUpgradeCost}</button>}
        <button className="tea-btn ghost" onClick={onExit}>回小镇</button>
        {chStage !== 'upgrade' && <button className="tea-btn primary" onClick={c.next}>继续经营 →</button>}
      </div>
    </section>}

    {drawer !== 'none' && <aside className="tea-drawer">
      <h3>{drawer === 'history' ? '历史报告' : '受雇通知'}<button onClick={() => setDrawer('none')} aria-label="关闭">×</button></h3>
      {drawer === 'history' && (home.recentRuns.length ? home.recentRuns.map(r => <button key={r.id} className="tea-hist" onClick={() => { setDrawer('none'); void c.openRun(r.id); }}>
        <b className={r.result.passed ? 'ok' : 'bad'}>{r.result.completed}杯</b><span>{new Date(r.settledAt < 1e12 ? r.settledAt * 1000 : r.settledAt).toLocaleString('zh-CN', { hour12: false })}</span>
        <em>{r.result.profit >= 0 ? '+' : ''}¥{r.result.profit}</em></button>) : <p className="tea-empty">还没有正式营业记录</p>)}
      {drawer === 'notices' && (home.notices.length ? home.notices.map(n => <div key={n.id} className="tea-notice">
        <b>{n.employer}</b> 雇了「{n.worker}」做{ROLE[n.role]}<span>出杯 {n.completed} · 工资 +¥{n.salary}</span>
      </div>) : <p className="tea-empty">暂无受雇通知</p>)}
    </aside>}

    {c.error && <div className="tea-banner">{c.error}<button onClick={() => void c.load()}>刷新</button></div>}
    {c.toast && <div className="tea-toast" role="status">{c.toast}</div>}
  </div>;
}
