import { useRef } from 'react';
import type { TeaChallenge, TeaRole, TeaRun, TeaSkill, TeaStrategy, TeaWorker } from '../../shared/tea.ts';
import type { TeaLiveHome } from '../../shared/teaLive.ts';
import { useDialogFocus } from '../ui/useDialogFocus.ts';

// 开班确认与经营报表：只呈现 controller/服务端给的真实数据，不计算结算。

const ROLE: Record<TeaRole, string> = { cashier: '前台', maker: '制作', support: '机动' };
const STRATEGY: Record<TeaStrategy, string> = { balanced: '均衡', speed: '快出杯', service: '用心服务' };
const SKILL: Record<TeaSkill, string> = {
  none: '无技能', batch_master: '批量大师', golden_service: '金牌服务', rescue_captain: '救场队长', materials_saver: '省料达人', steady_hand: '稳手',
};
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** 真实 frames 的累计出杯曲线 + 目标虚线 + 流失点。 */
function Curve({ run }: { run: TeaRun }) {
  const f = run.result.frames;
  if (f.length < 2) return null;
  const W = 300, H = 80;
  const dur = Math.max(run.challenge.duration, f[f.length - 1].t, 1);
  const maxY = Math.max(run.challenge.target, ...f.map(x => x.served), 1) * 1.1;
  const X = (t: number) => ((t / dur) * W).toFixed(1);
  const Y = (v: number) => (H - (v / maxY) * H).toFixed(1);
  const pts = f.map(x => `${X(x.t)},${Y(x.served)}`).join(' ');
  const lost = f.filter((x, i) => i > 0 && x.lost > f[i - 1].lost);
  return <figure className="tea-curve tea-receipt-curve">
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="累计出杯曲线">
      <line x1="0" x2={W} y1={Y(run.challenge.target)} y2={Y(run.challenge.target)} className="target" />
      <polyline points={`0,${H} ${pts} ${W},${H}`} className="area" />
      <polyline points={pts} className="line" />
      {lost.map(x => <circle key={x.t} cx={X(x.t)} cy={H - 3} r="2.2" className="lost" />)}
    </svg>
    <figcaption><span>累计出杯</span><span>目标 {run.challenge.target}</span><span>{fmtTime(dur)}</span></figcaption>
  </figure>;
}

/** 开班确认：阵容/备货/策略/费用一屏看清，最终按钮才真正开门。 */
export function OpenConfirm({ mode, team, roles, stock, strategy, cost, challenge, balance, busy, blocked, onCancel, onStart }: {
  mode: 'practice' | 'official'; team: TeaWorker[]; roles: Record<string, TeaRole>; stock: number; strategy: TeaStrategy;
  cost: { material: number; wages: number; operating: number; total: number }; challenge: TeaChallenge; balance: number;
  busy: boolean; blocked: string; onCancel: () => void; onStart: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, true);
  const official = mode === 'official';
  return <div className="tea-modal" onKeyDown={e => { if (e.key === 'Escape' && !busy) onCancel(); }}>
    <section ref={ref} className="tea-sheet tea-confirm" role="dialog" aria-modal="true" aria-labelledby="tea-confirm-title" data-testid="tea-open-confirm" tabIndex={-1}>
      <header>
        <small>{official ? '正式营业' : '免费试营业'}</small>
        <h2 id="tea-confirm-title">准备开门</h2>
        <span className="tea-chip">{challenge.arrivals} 位客人 · 目标 {challenge.target} 杯 · {fmtTime(challenge.duration)}</span>
      </header>
      <ul className="tea-crewlist">
        {team.map(w => <li key={w.id} style={{ '--c': w.color } as React.CSSProperties}>
          <i /><b>{w.id === 'self' ? '你' : w.name}</b><span>{challenge.flow === 'counter.1' ? ({cashier:'端送',maker:'制作',support:w.id==='self'?'随时帮忙':'忙时补位'}[roles[w.id]??'support']) : ROLE[roles[w.id]??'support']}</span><em>{w.id === 'self' ? '半自动' : '全自动'}</em>
        </li>)}
      </ul>
      <div className="tea-confirm-plan"><span>备货 <b>{stock}</b> 份</span><span>策略 <b>{STRATEGY[strategy]}</b></span><span>售价 <b>{challenge.price}</b></span></div>
      {official
        ? <dl className="tea-slip">
          <dt>原料</dt><dd>{cost.material}</dd><dt>工资</dt><dd>{cost.wages}</dd><dt>运营</dt><dd>{cost.operating}</dd>
          <dt className="sum">预付</dt><dd className="sum bad">−{cost.total} 金币</dd>
          <dt>开门后余额</dt><dd>{balance - cost.total}</dd>
        </dl>
        : <p className="tea-free">试营业不扣金币、不计进度</p>}
      {blocked && <p className="tea-hint bad">{blocked}</p>}
      <div className="tea-sheet-actions">
        <button className="tea-btn ghost" disabled={busy} onClick={onCancel}>再想想</button>
        <button className="tea-btn primary" disabled={busy || !!blocked} onClick={onStart} data-testid="tea-confirm-start">
          {busy ? '开门中…' : '准备好了，开始营业'}</button>
      </div>
    </section>
  </div>;
}

/** 经营报表：收银小票式，主要财务默认展开。 */
export function ReportDialog({ run, home, busy, bonusFor, canUpgrade, nextGoal, onUpgrade, onPrep, onExit }: {
  run: TeaRun; home: TeaLiveHome; busy: boolean; bonusFor: boolean; canUpgrade: boolean; nextGoal: string;
  onUpgrade: () => void; onPrep: () => void; onExit: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, true, undefined, true);
  const r = run.result;
  const official = run.mode === 'official';
  const net = r.profit + r.bonus;
  const ch = run.challenge;
  const when = new Date(run.settledAt < 1e12 ? run.settledAt * 1000 : run.settledAt).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return <div className="tea-modal">
    <section ref={ref} className="tea-sheet tea-report tea-receipt" role="dialog" aria-modal="true" aria-labelledby="tea-report-title" data-testid="tea-report-dialog" tabIndex={-1}>
      <header>
        <small>{ch.shopLevel ? `Lv.${ch.shopLevel} · ` : ''}{ch.name}</small>
        <h2 id="tea-report-title">{ch.flow==='counter.1'?`第 ${ch.businessDay} 天 · 营业日报`:'夜间营业报告'}</h2>
        <span className={`tea-chip ${official ? '' : 'dim'}`}>{official ? '正式' : '试营业'} · {when}</span>
      </header>

      <div className="tea-net-big">
        {official
          ? <><small>本班净赚</small><b className={net >= 0 ? 'ok' : 'bad'} data-testid="tea-report-net">{signed(net)}</b><em>金币</em></>
          : <><small>试营业</small><b className="dim">无结算</b><em>不扣金币 · 不计进度</em></>}
      </div>

      <div className="tea-kpi3">
        <span className={r.completed >= ch.target ? 'ok' : ''}><b>{r.completed}</b><small>/ {ch.target} 杯</small></span>
        <span><b>{r.arrivals}</b><small>到店</small></span>
        <span className={r.lost > 0 ? 'bad' : ''}><b>{r.lost}</b><small>流失</small></span>
      </div>

      <Curve run={run} />
      {ch.flow==='counter.1' && official && <div className="tea-kpi3"><span><b>+{r.selfMade??0}</b><small>制作熟练度</small></span><span><b>+{r.selfServed??0}</b><small>端送熟练度</small></span><span><b>{home.counter?.day??1}</b><small>下一经营日</small></span></div>}

      {official && <dl className="tea-slip">
        <dt>营收</dt><dd className="ok">+{r.revenue}</dd>
        <dt>原料</dt><dd className="bad">−{r.materialCost}</dd>
        <dt>工资</dt><dd className="bad">−{r.wages}</dd>
        <dt>运营</dt><dd className="bad">−{r.operatingCost}</dd>
        {r.bonus > 0 && <><dt>达标奖</dt><dd className="ok">+{r.bonus}</dd></>}
        <dt className="sum">净赚</dt><dd className={`sum ${net >= 0 ? 'ok' : 'bad'}`}>{signed(net)}</dd>
        <dt className="cut">预付已扣</dt><dd className="cut">−{r.totalCost}</dd>
        <dt>实际到账</dt><dd>+{r.revenue + r.bonus}</dd>
        <dt>结算后钱包</dt><dd>{run.coinsAfter}</dd>
      </dl>}

      <p className="tea-cause"><b>{r.bottleneck}</b>{r.suggestion && <span>{r.suggestion}</span>}</p>
      {official && bonusFor && <p className="tea-rescued">✓ 救店任务完成</p>}
      {nextGoal && <p className="tea-nextgoal"><small>下一目标</small>{nextGoal}</p>}

      <details className="tea-more"><summary>更多</summary>
        <div className="tea-loss">
          <span>前台流失 <b>{r.lostCashier}</b></span><span>制作流失 <b>{r.lostMaker}</b></span>{r.lostStock > 0 && <span>缺货 <b>{r.lostStock}</b></span>}
          <span>前台等待 <b>{r.avgCashierWait.toFixed(1)}s</b></span><span>制作等待 <b>{r.avgMakerWait.toFixed(1)}s</b></span><span>剩余原料 <b>{r.stockLeft.toFixed(1)}</b></span>
        </div>
        <div className="tea-skills">{Object.entries(r.skillCounts).filter(([, v]) => v > 0).map(([k, v]) => <i key={k}>{SKILL[k as TeaSkill] ?? '技能'} ×{v}</i>)}</div>
      </details>

      <div className="tea-sheet-actions">
        <button className="tea-btn ghost" onClick={onExit}>回小镇</button>
        <button className="tea-btn" disabled={busy} onClick={onPrep} data-testid="tea-report-prep">{ch.flow==='counter.1'?'准备下一天':'回筹备'}</button>
        {canUpgrade && <button className="tea-btn primary" disabled={busy || home.wallet.balance < home.shop.nextUpgradeCost} onClick={onUpgrade} data-testid="tea-report-upgrade">
          升级 {home.shop.nextUpgradeCost}</button>}
      </div>
    </section>
  </div>;
}
