import { sound } from '../audio.ts';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { animateBelt, BELT_ZONE as ZONE } from './beltAnimation.ts';
import { PERF_ENABLED } from '../performance.ts';
import {
  MIN_ACTION_GAP_MS,
  TASK_META,
  generateTasks,
  pointsForCombo,
  projectDuration,
  scoreProject,
} from '../../shared/rules.ts';
import type {
  ProjectAction,
  ProjectResult,
  ProjectTask,
} from '../../shared/rules.ts';
import type { ProjectRunView, YearAward } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { serverNow, useGame } from '../store.ts';
import { useWorld } from '../world/runtime.ts';
import { isTypingTarget } from '../world/input.ts';
import { fmt } from './common.tsx';
import {
  Cherry,
  Coffee,
  Coins,
  Crown,
  Donut,
  Gift,
  Play,
  Shield,
  Sparkles,
  Star,
  Timer,
  X,
} from 'lucide-react';
import { Avatar } from './Avatar.tsx';
import { Portrait } from '../scene/Portrait.tsx';
import { dressed, dressedColleague, isBoss } from '../look.ts';
import { myTeam } from '../store.ts';

const ARCADE = {
  mail: { Icon: Gift, name: '礼物' },
  bug: { Icon: Cherry, name: '樱桃' },
  meeting: { Icon: Coffee, name: '咖啡' },
  report: { Icon: Star, name: '星星' },
  trap: { Icon: Donut, name: '大饼' },
};

/**
 * 紧急项目（单输入）：任务卡从左往右滑过传送带，进入右侧光圈时按「空格」或点「处理」。
 * 光圈里同时有多张卡时处理最靠右的那张；🥧 大饼也会滑进光圈——它在最前面时别按。
 * 上报的是真实操作 {taskId, t}；奖励由服务端独立重算，前端用同一规则算出的分数与服务端结果对照显示。
 */

type Stage = 'brief' | 'starting' | 'playing' | 'settling' | 'result' | 'error';

/** Mount card contents once; frame motion updates only their compositor transform. */
const BeltTask = memo(function BeltTask({ task, nodes }: { task: ProjectTask; nodes: RefObject<Map<number, HTMLSpanElement>> }) {
  const ref = useCallback((node: HTMLSpanElement | null) => {
    if (node) nodes.current.set(task.id, node);
    else nodes.current.delete(task.id);
  }, [nodes, task.id]);
  const meta = ARCADE[task.kind];
  const Icon = meta.Icon;
  return <span ref={ref} className={`belt-item ${task.kind === 'trap' ? 'trap' : ''}`}
    style={{ left: 0, display: 'none', transition: 'none', '--c': TASK_META[task.kind].color } as React.CSSProperties}
    data-testid={`task-${task.kind}`} data-in-zone="0" aria-label={meta.name}>
    <Icon size={35} strokeWidth={1.8} /><small>{meta.name}</small>
  </span>;
});

interface Live {
  combo: number;
  maxCombo: number;
  score: number;
  shieldLeft: number;
  hits: number;
}

interface Pop {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'shield' | 'idle';
}

const actionsKey = (runId: string) => `boss.run.${runId}`;

export function ProjectGame() {
  const open = useWorld((s) => s.projectOpen);
  const setOpen = useWorld((s) => s.setProjectOpen);
  if (!open) return null;
  return <ProjectPanel onClose={() => setOpen(false)} />;
}

function ProjectPanel({ onClose }: { onClose: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const refresh = useGame((s) => s.refresh);
  const toast = useGame((s) => s.toast);
  const setProjectActive = useGame((s) => s.setProjectActive);
  const [stage, setStage] = useState<Stage>('brief');
  const [run, setRun] = useState<ProjectRunView | null>(null);
  const [result, setResult] = useState<ProjectResult | null>(null);
  const [award, setAward] = useState<YearAward | null>(null);
  const [growth, setGrowth] = useState(0);
  const [matches, setMatches] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [live, setLive] = useState<Live>({
    combo: 0,
    maxCombo: 0,
    score: 0,
    shieldLeft: 0,
    hits: 0,
  });
  const [pops, setPops] = useState<Pop[]>([]);
  const [flash, setFlash] = useState(0);
  const actions = useRef<ProjectAction[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const belt = useRef<HTMLDivElement>(null);
  const taskNodes = useRef(new Map<number, HTMLSpanElement>());
  const beltWidth = useRef(0);
  const done = useRef(new Set<number>());
  const missed = useRef(new Set<number>());
  const liveRef = useRef(live);
  liveRef.current = live;
  const updateLive = useCallback((next: Live) => {
    liveRef.current = next;
    setLive(next);
  }, []);
  const popSeq = useRef(1);
  const lastSecond = useRef(-1);
  const sk = snap.projectSkills;
  const team = myTeam(snap);
  const boss =
    team.find((c) => isBoss(c.id)) ??
    team[0] ??
    snap.colleagues.find((c) => c.id === snap.me.avatarColleagueId)!;
  const bossLook = team.length ? dressedColleague(boss, snap.me.style) : dressed(boss.look, snap.me.style);
  const tasks = useMemo<ProjectTask[]>(
    () => (run ? generateTasks(run.seed, run.durationMs) : []),
    [run],
  );

  // 打开期间锁定行走
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const buttons = Array.from(
        panel.current?.querySelectorAll<HTMLButtonElement>(
          'button:not(:disabled)',
        ) ?? [],
      );
      if (!buttons.length) {
        e.preventDefault();
        panel.current?.focus();
        return;
      }
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        buttons.at(-1)?.focus();
      } else if (!e.shiftKey && (i < 0 || i === buttons.length - 1)) {
        e.preventDefault();
        buttons[0]?.focus();
      }
    };
    window.addEventListener('keydown', onTab);
    useWorld.getState().lock('project');
    return () => {
      window.removeEventListener('keydown', onTab);
      if (before?.isConnected) before.focus();
      useWorld.getState().unlock('project');
      setProjectActive(false);
    };
  }, [setProjectActive]);
  useEffect(() => {
    setProjectActive(stage === 'playing' || stage === 'settling');
  }, [stage, setProjectActive]);

  const pop = (text: string, tone: Pop['tone']) => {
    const id = popSeq.current++;
    setPops((p) => [...p.slice(-3), { id, text, tone }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 800);
  };

  const fault = (label: string, audible = true) => {
    const l = { ...liveRef.current };
    if (l.shieldLeft > 0) {
      l.shieldLeft--;
      sound.play('shield');
      pop(`🛡️ 护盾挡住${label}`, 'shield');
    } else {
      l.combo = 0;
      if (audible) sound.play('miss');
      pop(label, 'bad');
    }
    updateLive(l);
  };

  const begin = useCallback((r: ProjectRunView) => {
    setRun(r);
    const saved = sessionStorage.getItem(actionsKey(r.id));
    actions.current = saved ? (JSON.parse(saved) as ProjectAction[]) : [];
    done.current = new Set(actions.current.map((a) => a.taskId));
    missed.current = new Set();
    updateLive({
      combo: 0,
      maxCombo: 0,
      score: 0,
      shieldLeft: r.skills.shield,
      hits: 0,
    });
    setResult(null);
    setAward(null);
    setGrowth(0);
    setError(null);
    lastSecond.current = -1;
    setNow(0);
    setStage('playing');
    sound.play('start');
  }, [updateLive]);

  const settle = useCallback(
    async (r: ProjectRunView) => {
      setStage('settling');
      const wait = r.deadline - serverNow();
      if (wait > 0) await new Promise((res) => setTimeout(res, wait + 120));
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await api.finishProject(r.id, actions.current);
          sessionStorage.removeItem(actionsKey(r.id));
          const local = scoreProject(
            generateTasks(r.seed, r.durationMs),
            actions.current,
            r.skills,
            r.durationMs,
            r.durationMs,
          );
          setMatches(local.total === res.result.total);
          setResult(res.result);
          setGrowth(res.performanceEarned);
          setAward(res.yearAward);
          setStage('result');
          if (res.result.total > 0) sound.play('coins', { key: `project:${r.id}` });
          toast({
            tone: 'gold',
            title: `快乐基金 +${res.result.total} · 成长值 +${res.performanceEarned}`,
          });
          void refresh();
          return;
        } catch (e) {
          if (e instanceof ApiError && e.code === 'TOO_EARLY') {
            await new Promise((res) => setTimeout(res, 400));
            continue;
          }
          setError(e instanceof ApiError ? e.message : '结算失败');
          setStage('error');
          void refresh();
          return;
        }
      }
    },
    [refresh, toast],
  );

  const start = async () => {
    const pending = snap.activeRun;
    if (pending) {
      if (serverNow() < pending.deadline) return begin(pending);
      setRun(pending);
      const saved = sessionStorage.getItem(actionsKey(pending.id));
      actions.current = saved ? (JSON.parse(saved) as ProjectAction[]) : [];
      return void settle(pending);
    }
    setStage('starting');
    try {
      const { run: r } = await api.startProject();
      begin(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '开始失败');
      setStage('error');
    }
  };

  useLayoutEffect(() => {
    const element = belt.current;
    if (!element) return;
    const measure = () => { beltWidth.current = element.clientWidth; };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [stage, run]);

  // Motion and input retain frame-precise server time. React only updates the
  // visible timer at 10Hz, plus actual catches/misses, instead of every frame.
  useEffect(() => {
    if (stage !== 'playing' || !run) return;
    let raf = 0;
    let publishedAt = -Infinity;
    let animationFrames = 0;
    let clockUpdates = 0;
    const loop = () => {
      const t = serverNow() - run.startedAt;
      animateBelt(taskNodes.current, tasks, done.current, t, beltWidth.current);
      animationFrames++;
      if (t - publishedAt >= 100 || t >= run.durationMs) {
        publishedAt = t;
        setNow(t);
        if (PERF_ENABLED && panel.current) {
          panel.current.dataset.animationFrames = String(animationFrames);
          panel.current.dataset.clockUpdates = String(++clockUpdates);
        }
      }
      const second = Math.ceil((run.durationMs - t) / 1000);
      if (second > 0 && second <= 3 && second !== lastSecond.current) {
        lastSecond.current = second;
        sound.play('countdown');
      }
      for (const task of tasks) {
        if (
          task.kind === 'trap' ||
          done.current.has(task.id) ||
          missed.current.has(task.id)
        )
          continue;
        if (t > task.spawnAt + task.ttl) {
          missed.current.add(task.id);
          fault('漏掉了！', false);
        }
      }
      if (t >= run.durationMs) {
        void settle(run);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, run, tasks, settle]);

  /** 唯一的操作：处理光圈里最靠前的任务 */
  const act = useCallback(() => {
    if (!run || stage !== 'playing') return;
    const t = Math.round(serverNow() - run.startedAt);
    const last = actions.current[actions.current.length - 1];
    if (last && t - last.t < MIN_ACTION_GAP_MS) return;
    let best: ProjectTask | null = null;
    let bestP = -1;
    for (const k of tasks) {
      if (done.current.has(k.id)) continue;
      const p = (t - k.spawnAt) / k.ttl;
      if (
        p >= ZONE[0] &&
        p <= ZONE[1] &&
        t >= k.spawnAt &&
        t <= k.spawnAt + k.ttl &&
        p > bestP
      ) {
        best = k;
        bestP = p;
      }
    }
    setFlash((f) => f + 1);
    if (!best) {
      sound.play('miss');
      pop('等礼物进圈，再接住', 'idle');
      return;
    }
    done.current.add(best.id);
    actions.current.push({ taskId: best.id, t });
    sessionStorage.setItem(actionsKey(run.id), JSON.stringify(actions.current));
    if (best.kind === 'trap') {
      fault('🥧 被画饼了！');
      return;
    }
    const l = { ...liveRef.current };
    l.combo++;
    l.hits++;
    sound.play('catch', { combo: l.combo });
    l.maxCombo = Math.max(l.maxCombo, l.combo);
    const pts = pointsForCombo(l.combo);
    l.score += pts;
    updateLive(l);
    pop(`+${pts}${l.combo > 1 ? ` 连击×${l.combo}` : ''}`, 'good');
  }, [run, stage, tasks, updateLive]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (stage === 'playing' && !e.repeat) act();
        else if (stage === 'brief') void start();
      }
      if (
        e.code === 'Escape' &&
        (stage === 'brief' || stage === 'result' || stage === 'error')
      )
        onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const remaining = run ? Math.max(0, run.durationMs - now) : 0;
  const preview = Math.floor(
    (live.score * (100 + (run?.skills.incomePct ?? 0))) / 100,
  );

  const finish = () => {
    onClose();
    if (award)
      useGame.getState().celebrate({
        key: `year:${snap.me.id}:${award.year}`,
        title: `第 ${award.year} 年 · 年终奖到啦`,
        body: '老板的努力，换成你喜欢的小东西。奖金已放进钱包。',
        amount: award.total,
      });
  };
  return (
    <div
      ref={panel}
      tabIndex={-1}
      className="project-overlay arcade-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="老板来接招"
      data-testid="project-overlay"
    >
      {stage === 'brief' && (
        <div className="panel pg-card arcade-brief">
          <button
            className="v3-icon arcade-close"
            onClick={onClose}
            aria-label="关闭小游戏"
          >
            <X size={19} />
          </button>
          <div className="arcade-brief-model">
            <Portrait look={bossLook} wave />
          </div>
          <div className="arcade-brief-copy">
            <span className="eyebrow">{projectDuration(sk) / 1000} 秒小游戏</span>
            <h3>老板，来接招！</h3>
            <ul className="arcade-rules">
              <li className="good"><Gift size={16} />礼物进圈，点一下接住</li>
              <li className="bad"><Donut size={16} />大饼别接，会断连击</li>
            </ul>
            <div className="arcade-rewards">
              <span>
                <Timer size={15} />
                {projectDuration(sk) / 1000} 秒
              </span>
              <span>
                <Coins size={15} />
                赢金币
              </span>
              <span>
                <Crown size={15} />
                涨成长值
              </span>
            </div>
            <div className="arcade-skill-note">
              {team.length ? `${boss.name}助阵` : '单人出战'} · 收益加成 +{sk.incomePct}%
            </div>
            <button
              className="v3-primary wide"
              onClick={() => void start()}
              autoFocus
              data-testid="btn-project-start"
            >
              <Play size={18} />
              {snap.activeRun ? '继续这一局' : '开始快乐营业'}
              <kbd>空格</kbd>
            </button>
            <small className="quiet-note">
              每年 {snap.year.required} 局有命中，发一次年终奖
            </small>
          </div>
        </div>
      )}
      {stage === 'starting' && (
        <div className="panel pg-card center arcade-loading" role="status">老板正在热身…</div>
      )}
      {(stage === 'playing' || stage === 'settling') && run && (
        <div className="panel pg-board arcade-board">
          <div className="arcade-heading">
            <span>
              <Avatar look={bossLook} size={42} />
              <b>
                {boss.name}正在接招<small>接住快乐，拒绝大饼</small>
              </b>
            </span>
            <strong>
              <Timer size={18} />
              <span data-testid="project-timer">
                {(remaining / 1000).toFixed(1)}
              </span>
              <small>秒</small>
            </strong>
          </div>
          <div className="timebar">
            <i style={{ width: `${(remaining / run.durationMs) * 100}%` }} />
          </div>
          <div className="arcade-score-row">
            <span className={`pg-combo ${live.combo >= 5 ? 'hot' : ''}`}>
              连击 <b>×{live.combo}</b>
            </span>
            <span className="arcade-shields">
              <Shield size={16} />
              {live.shieldLeft} 次救场
            </span>
            <span className="pg-score" data-testid="project-score">
              <Coins size={17} />
              {fmt(preview)}
            </span>
          </div>
          <div ref={belt} className="belt" onPointerDown={act} data-testid="project-belt">
            <div className="belt-lines" />
            <div
              className="belt-zone"
              style={{
                left: `${ZONE[0] * 100}%`,
                width: `${(ZONE[1] - ZONE[0]) * 100}%`,
              }}
              key={flash}
            >
              <span>接住区</span>
            </div>
            {tasks.map(task => <BeltTask key={task.id} task={task} nodes={taskNodes} />)}
            {pops.map((p) => (
              <span key={p.id} className={`pg-pop ${p.tone}`}>
                {p.text}
              </span>
            ))}
          </div>
          <div className="arcade-act-row">
            <span>
              <Donut size={19} />
              这是大饼，别接！
            </span>
            <button
              className="v3-primary pg-act"
              onPointerDown={(e) => {
                e.preventDefault();
                act();
              }}
              data-testid="btn-project-act" data-sound="none"
            >
              接住！<kbd>空格</kbd>
            </button>
          </div>
          {stage === 'settling' && (
            <div className="settling">老板正在数金币…</div>
          )}
        </div>
      )}
      {stage === 'result' && result && (
        <div
          className="panel pg-card result arcade-result"
          data-testid="project-result"
        >
          <span className="eyebrow">本局结算</span>
          <div className="result-emblem">
            <Gift size={40} strokeWidth={1.4} />
          </div>
          <h3>
            {result.hits ? '快乐营业，圆满收工！' : '再试一次，快乐不打烊'}
          </h3>
          <div className="result-total">
            <Coins size={27} />+<b>{fmt(result.total)}</b>
          </div>
          <div className="growth-earned">
            <Crown size={16} />
            成长值 +{growth}
          </div>
          <div className="pg-stats">
            <span>接住 {result.hits} 次</span>
            <span>最高连击 ×{result.maxCombo}</span>
            {result.shieldsUsed > 0 && (
              <span>救场 {result.shieldsUsed} 次</span>
            )}
          </div>
          {award ? (
            <div className="annual-mini" data-testid="annual-award">
              <Gift size={20} />
              <span>
                第 {award.year} 年年终奖<b>额外 +{fmt(award.total)} 金币</b>
              </span>
              <Sparkles size={18} />
            </div>
          ) : (
            <div className="result-year">
              {result.hits
                ? `本年已玩 ${snap.year.completed}/${snap.year.required} 场，离年终奖又近一步`
                : '接住至少一件礼物，才计入年终进度'}
            </div>
          )}
          {matches != null && (
            <p className="fine" data-testid="project-verify">
              {matches ? '✓ 结算已核对' : '以最终结算为准'}
            </p>
          )}
          <button
            className="v3-primary wide"
            onClick={finish}
            autoFocus
            data-testid="btn-project-close"
          >
            {award ? '打开我的年终奖' : '收下快乐，回园区'}
          </button>
        </div>
      )}
      {stage === 'error' && (
        <div className="panel pg-card arcade-error" role="alert">
          <b>这一局没连上</b>
          <p>{error}</p>
          <button className="v3-primary" onClick={onClose}>
            回到园区
          </button>
        </div>
      )}
    </div>
  );
}
