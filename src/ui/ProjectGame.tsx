import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MIN_ACTION_GAP_MS, TASK_META, generateTasks, pointsForCombo, projectDuration, scoreProject } from '../../shared/rules.ts';
import type { ProjectAction, ProjectResult, ProjectTask } from '../../shared/rules.ts';
import type { ProjectRunView } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { serverNow, useGame } from '../store.ts';
import { useWorld } from '../world/runtime.ts';
import { isTypingTarget } from '../world/input.ts';
import { fmt } from './common.tsx';

/**
 * 紧急项目（单输入）：任务卡从左往右滑过传送带，进入右侧光圈时按「空格」或点「处理」。
 * 光圈里同时有多张卡时处理最靠右的那张；🥧 大饼也会滑进光圈——它在最前面时别按。
 * 上报的是真实操作 {taskId, t}；奖励由服务端独立重算，前端用同一规则算出的分数与服务端结果对照显示。
 */

type Stage = 'brief' | 'starting' | 'playing' | 'settling' | 'result' | 'error';

/** 光圈范围（任务生命周期的比例），落在服务端接受的 [spawnAt, spawnAt+ttl] 之内 */
const ZONE = [0.58, 0.97] as const;

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
  const [matches, setMatches] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [live, setLive] = useState<Live>({ combo: 0, maxCombo: 0, score: 0, shieldLeft: 0, hits: 0 });
  const [pops, setPops] = useState<Pop[]>([]);
  const [flash, setFlash] = useState(0);
  const actions = useRef<ProjectAction[]>([]);
  const done = useRef(new Set<number>());
  const missed = useRef(new Set<number>());
  const liveRef = useRef(live);
  liveRef.current = live;
  const popSeq = useRef(1);
  const sk = snap.teamSkills;
  const tasks = useMemo<ProjectTask[]>(() => (run ? generateTasks(run.seed, run.durationMs) : []), [run]);

  // 打开期间锁定行走
  useEffect(() => {
    useWorld.getState().lock('project');
    return () => {
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

  const fault = (label: string) => {
    const l = { ...liveRef.current };
    if (l.shieldLeft > 0) {
      l.shieldLeft--;
      pop(`🛡️ 护盾挡住${label}`, 'shield');
    } else {
      l.combo = 0;
      pop(label, 'bad');
    }
    setLive(l);
  };

  const begin = useCallback((r: ProjectRunView) => {
    setRun(r);
    const saved = sessionStorage.getItem(actionsKey(r.id));
    actions.current = saved ? (JSON.parse(saved) as ProjectAction[]) : [];
    done.current = new Set(actions.current.map((a) => a.taskId));
    missed.current = new Set();
    setLive({ combo: 0, maxCombo: 0, score: 0, shieldLeft: r.skills.shield, hits: 0 });
    setResult(null);
    setError(null);
    setStage('playing');
  }, []);

  const settle = useCallback(
    async (r: ProjectRunView) => {
      setStage('settling');
      const wait = r.deadline - serverNow();
      if (wait > 0) await new Promise((res) => setTimeout(res, wait + 120));
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await api.finishProject(r.id, actions.current);
          sessionStorage.removeItem(actionsKey(r.id));
          const local = scoreProject(generateTasks(r.seed, r.durationMs), actions.current, r.skills, r.durationMs, r.durationMs);
          setMatches(local.total === res.result.total);
          setResult(res.result);
          setStage('result');
          toast({ tone: 'gold', title: `💰 项目完成 +${res.result.total}` });
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

  // 游戏循环：推进时间、判定漏掉
  useEffect(() => {
    if (stage !== 'playing' || !run) return;
    let raf = 0;
    const loop = () => {
      const t = serverNow() - run.startedAt;
      setNow(t);
      for (const task of tasks) {
        if (task.kind === 'trap' || done.current.has(task.id) || missed.current.has(task.id)) continue;
        if (t > task.spawnAt + task.ttl) {
          missed.current.add(task.id);
          fault('漏掉了！');
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
      if (p >= ZONE[0] && p <= ZONE[1] && t >= k.spawnAt && t <= k.spawnAt + k.ttl && p > bestP) {
        best = k;
        bestP = p;
      }
    }
    setFlash((f) => f + 1);
    if (!best) {
      pop('光圈里没东西', 'idle');
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
    l.maxCombo = Math.max(l.maxCombo, l.combo);
    const pts = pointsForCombo(l.combo);
    l.score += pts;
    setLive(l);
    pop(`+${pts}${l.combo > 1 ? ` 连击×${l.combo}` : ''}`, 'good');
  }, [run, stage, tasks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (stage === 'playing' && !e.repeat) act();
        else if (stage === 'brief') void start();
      }
      if (e.code === 'Escape' && (stage === 'brief' || stage === 'result' || stage === 'error')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const remaining = run ? Math.max(0, run.durationMs - now) : 0;
  const visible = tasks.filter((k) => now >= k.spawnAt && now <= k.spawnAt + k.ttl && !done.current.has(k.id));
  const preview = Math.floor((live.score * (100 + (run?.skills.incomePct ?? 0))) / 100);

  return (
    <div className="project-overlay" role="dialog" aria-label="紧急项目" data-testid="project-overlay">
      {stage === 'brief' && (
        <div className="panel pg-card">
          <h3>🚨 紧急项目</h3>
          <div className="pg-rule">
            卡片滑进<b className="ring-word">光圈</b>时按 <kbd>空格</kbd>，别碰 🥧
          </div>
          <div className="pg-buffs">
            <span>⏱ {projectDuration(sk) / 1000}s</span>
            <span>💰 +{sk.incomePct}%</span>
            <span>🛡 ×{sk.shield}</span>
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>
              算了
            </button>
            <button className="btn primary" onClick={() => void start()} autoFocus data-testid="btn-project-start">
              {snap.activeRun ? '继续' : '开始'}
            </button>
          </div>
        </div>
      )}
      {stage === 'starting' && <div className="panel pg-card center">⏳</div>}
      {(stage === 'playing' || stage === 'settling') && run && (
        <div className="panel pg-board">
          <div className="pg-top">
            <b className="pg-time" data-testid="project-timer">
              {(remaining / 1000).toFixed(1)}
            </b>
            <div className="timebar">
              <i style={{ width: `${(remaining / run.durationMs) * 100}%` }} />
            </div>
            <span className={`pg-combo ${live.combo >= 5 ? 'hot' : ''}`}>×{live.combo}</span>
            {run.skills.shield > 0 && <span className="pg-shield">🛡{live.shieldLeft}</span>}
            <span className="pg-score" data-testid="project-score">
              {fmt(preview)}
            </span>
          </div>
          <div className="belt" onPointerDown={act} data-testid="project-belt">
            <div className="belt-zone" style={{ left: `${ZONE[0] * 100}%`, width: `${(ZONE[1] - ZONE[0]) * 100}%` }} key={flash} />
            {visible.map((k) => {
              const p = (now - k.spawnAt) / k.ttl;
              const inZone = p >= ZONE[0] && p <= ZONE[1];
              return (
                <span
                  key={k.id}
                  className={`belt-item ${k.kind === 'trap' ? 'trap' : ''} ${inZone ? 'in' : ''}`}
                  style={{ left: `${p * 100}%`, ['--c' as string]: TASK_META[k.kind].color }}
                  data-testid={`task-${k.kind}`}
                  data-in-zone={inZone ? '1' : '0'}
                >
                  {TASK_META[k.kind].icon}
                </span>
              );
            })}
            {pops.map((p) => (
              <span key={p.id} className={`pg-pop ${p.tone}`}>
                {p.text}
              </span>
            ))}
          </div>
          <button className="btn primary pg-act" onPointerDown={(e) => (e.preventDefault(), act())} data-testid="btn-project-act">
            处理 <kbd>空格</kbd>
          </button>
          {stage === 'settling' && <div className="settling">结算中…</div>}
        </div>
      )}
      {stage === 'result' && result && (
        <div className="panel pg-card result" data-testid="project-result">
          <div className="result-total">
            +<b>{fmt(result.total)}</b>
          </div>
          <div className="pg-stats">
            <span>✅ {result.hits}</span>
            <span>🔥 最高×{result.maxCombo}</span>
            {result.incomeBonus > 0 && <span>💰 +{result.incomeBonus}</span>}
            {result.shieldsUsed > 0 && <span>🛡 {result.shieldsUsed}</span>}
          </div>
          {matches != null && (
            <p className="fine" data-testid="project-verify">
              {matches ? '✓ 与服务器结算一致' : '以服务器结算为准'}
            </p>
          )}
          <div className="modal-actions">
            <button className="btn primary" onClick={onClose} autoFocus data-testid="btn-project-close">
              收下
            </button>
          </div>
        </div>
      )}
      {stage === 'error' && (
        <div className="panel pg-card" role="alert">
          <p>{error}</p>
          <div className="modal-actions">
            <button className="btn primary" onClick={onClose}>
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
