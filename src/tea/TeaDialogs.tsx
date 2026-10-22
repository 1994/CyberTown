import { useEffect, useRef, useState } from 'react';
import { Trophy, Coins, CupSoda, Sparkles, ArrowUpRight, Check, Wallet } from 'lucide-react';
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
  const counter = challenge.flow?.startsWith('counter.');
  return <div className="tea-modal" onKeyDown={e => { if (e.key === 'Escape' && !busy) onCancel(); }}>
    <section ref={ref} className="tea-sheet tea-confirm" role="dialog" aria-modal="true" aria-labelledby="tea-confirm-title" data-testid="tea-open-confirm" tabIndex={-1}>
      <header>
        <small>{official ? '正式营业' : '免费试营业'}</small>
        <h2 id="tea-confirm-title">准备开门</h2>
        <span className="tea-chip">{challenge.arrivals} 位客人 · 目标 {challenge.target} 杯 · {fmtTime(challenge.duration)}</span>
      </header>
      {!counter&&<ul className="tea-crewlist">
        {team.map(w => <li key={w.id} style={{ '--c': w.color } as React.CSSProperties}>
          <i /><b>{w.id === 'self' ? '你' : w.name}</b><span>{challenge.flow?.startsWith('counter.') ? ({cashier:'端送',maker:'制作',support:w.id==='self'?'随时帮忙':'忙时补位'}[roles[w.id]??'support']) : ROLE[roles[w.id]??'support']}</span><em>{w.id === 'self' ? '半自动' : '全自动'}</em>
        </li>)}
      </ul>}
      <div className="tea-confirm-plan"><span>备货 <b>{stock}</b> 份</span>{!counter&&<span>策略 <b>{STRATEGY[strategy]}</b></span>}<span>售价 <b>{challenge.price}</b></span></div>
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

/** 只动画展示已结算结果；打开、重播、关闭均不触发奖励请求。 */
function RewardNumber({ value, runId }: { value: number; runId: string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    let id = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 950);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) id = requestAnimationFrame(tick);
    };
    setShown(0); id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value, runId]);
  return <><span aria-hidden="true">{signed(shown)}</span><span className="reward-sr">{signed(value)}</span></>;
}

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
  const rescued = official && bonusFor;
  const celebrate = official && net > 0;
  const title = !official ? '手感练起来了' : rescued ? '小店，被你救活了！' : net > 0 ? '今天的努力，到账了' : net === 0 ? '稳住了，继续加油' : '收工，下次赚回来';
  return <div className="tea-modal tea-result-backdrop">
    <section ref={ref} className={`tea-sheet tea-report tea-result ${celebrate ? 'is-success' : ''}`} role="dialog" aria-modal="true" aria-labelledby="tea-report-title" data-testid="tea-report-dialog" tabIndex={-1}>
      <header className="result-heading">
        <small>{ch.shopLevel === 3 ? '夜城茶饮' : ch.shopLevel === 2 ? '霓虹奶茶' : '街角奶茶'} / {ch.flow?.startsWith('counter.') ? `第 ${ch.businessDay} 天` : ch.name} · {official ? '营业结束' : '试营业结束'}</small>
        <div className="result-emblem" aria-hidden="true">{celebrate ? <Trophy/> : <CupSoda/>}</div>
        <h2 id="tea-report-title">{title}</h2>
        <span className="result-stamp">{rescued ? '救店任务完成' : r.completed >= ch.target ? '出杯目标达成' : `已服务 ${r.completed} 位顾客`}</span>
      </header>
      <div className={`result-income ${official && net < 0 ? 'is-loss' : ''}`}>
        {celebrate && <div className="result-rays" aria-hidden="true">{Array.from({length: 12}, (_, i) => <i key={i} style={{'--i': i} as React.CSSProperties}/>)}</div>}
        <small>{official ? net < 0 ? '本班亏损' : '本班净赚' : '练习完成'}</small>
        <b data-testid="tea-report-net">{official ? <RewardNumber value={net} runId={String(run.id)}/> : '不计收支'}</b>
        <span>{official ? '金币 · 已计入钱包' : '不扣金币 · 不计任务进度'}</span>
      </div>
      {official && <div className="result-rewards" aria-label="本班收获">
        <div className="result-reward"><Coins size={20}/><span>营业到账<small>营收 {r.revenue}{r.bonus > 0 ? ` + 奖励 ${r.bonus}` : ''}</small></span><b>+{r.revenue + r.bonus}</b></div>
        {r.bonus > 0 && <div className="result-bonus"><Sparkles size={16}/><span>其中 · 达标奖励</span><b>+{r.bonus}</b></div>}
        {ch.flow?.startsWith('counter.') && <div className="result-growth"><span><CupSoda size={16}/>制作熟练度 <b>+{r.selfMade ?? 0}</b></span><span><ArrowUpRight size={16}/>端送熟练度 <b>+{r.selfServed ?? 0}</b></span></div>}
        <div className="result-wallet"><Wallet size={15}/>钱包余额 <b>{run.coinsAfter}</b><Check size={14}/></div>
      </div>}
      <div className="result-next"><small>{celebrate ? '下一站' : '下一班试试'}</small><p>{celebrate ? nextGoal || '继续经营，让小店更上一层楼' : r.suggestion || nextGoal || '再熟悉一次制作和端送的节奏'}</p></div>
      <details className="tea-more result-details"><summary>经营明细 <span>{r.completed}/{ch.target} 杯 · 流失 {r.lost}</span></summary>
        <Curve run={run}/>
        {official && <dl className="tea-slip">
          <dt>营收</dt><dd className="ok">+{r.revenue}</dd>
          <dt>原料</dt><dd>−{r.materialCost}</dd><dt>工资</dt><dd>−{r.wages}</dd><dt>运营</dt><dd>−{r.operatingCost}</dd>
          {r.bonus > 0 && <><dt>达标奖（已含在到账中）</dt><dd>+{r.bonus}</dd></>}
          <dt className="sum">净收益</dt><dd className="sum">{signed(net)}</dd>
          <dt>预付已扣</dt><dd>−{r.totalCost}</dd><dt>本次到账</dt><dd>+{r.revenue + r.bonus}</dd>
        </dl>}
        <p className="tea-cause">{r.bottleneck}</p>
        <div className="tea-loss"><span>到店 {r.arrivals}</span><span>制作流失 {r.lostMaker}</span><span>端送流失 {r.lostCashier}</span><span>缺货流失 {r.lostStock}</span><span>制作等待 {r.avgMakerWait.toFixed(1)}s</span><span>端送等待 {r.avgCashierWait.toFixed(1)}s</span><span>剩余原料 {r.stockLeft.toFixed(1)}</span></div>
        <div className="tea-skills">{Object.entries(r.skillCounts).filter(([, v]) => v > 0).map(([k, v]) => <i key={k}>{SKILL[k as TeaSkill] ?? '技能'} ×{v}</i>)}</div>
      </details>
      <div className="tea-sheet-actions">
        <button className="tea-btn ghost" onClick={onExit}>回小镇</button>
        <button className={`tea-btn ${!canUpgrade ? 'primary' : ''}`} disabled={busy} onClick={onPrep} data-testid="tea-report-prep">{!official ? '回店准备 →' : ch.flow?.startsWith('counter.') ? '准备下一天 →' : '回筹备 →'}</button>
        {canUpgrade && <button className="tea-btn primary" disabled={busy || home.wallet.balance < home.shop.nextUpgradeCost} onClick={onUpgrade} data-testid="tea-report-upgrade">升级小店 · {home.shop.nextUpgradeCost}</button>}
      </div>
    </section>
  </div>;
}
