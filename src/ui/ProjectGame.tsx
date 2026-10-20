import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LANES, TASK_META, generateTasks, pointsForCombo, projectDuration } from '../../shared/rules.ts';
import type { ProjectAction, ProjectResult, ProjectTask } from '../../shared/rules.ts';
import type { ProjectRunView } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { serverNow, useGame } from '../store.ts';
import { fmt } from './Hud.tsx';

type Stage = 'idle' | 'brief' | 'starting' | 'playing' | 'settling' | 'result' | 'error';

interface Live {
  combo: number;
  maxCombo: number;
  score: number;
  shieldLeft: number;
  hits: number;
  misses: number;
}

interface Pop {
  id: number;
  lane: number;
  text: string;
  tone: 'good' | 'bad' | 'shield';
}

const actionsKey = (runId: string) => `boss.run.${runId}`;

export function ProjectGame() {
  const snap = useGame((s) => s.snapshot)!;
  const refresh = useGame((s) => s.refresh);
  const toast = useGame((s) => s.toast);
  const setProjectActive = useGame((s) => s.setProjectActive);
  const [stage, setStage] = useState<Stage>('idle');
  const [run, setRun] = useState<ProjectRunView | null>(null);
  const [result, setResult] = useState<ProjectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0); // 相对开始的毫秒（按服务器时钟）
  const [live, setLive] = useState<Live>({ combo: 0, maxCombo: 0, score: 0, shieldLeft: 0, hits: 0, misses: 0 });
  const [pops, setPops] = useState<Pop[]>([]);
  const actions = useRef<ProjectAction[]>([]);
  const done = useRef(new Set<number>());
  const missed = useRef(new Set<number>());
  const liveRef = useRef(live);
  liveRef.current = live;
  const popSeq = useRef(1);

  const tasks = useMemo<ProjectTask[]>(() => (run ? generateTasks(run.seed, run.durationMs) : []), [run]);
  const sk = snap.teamSkills;
  const pending = snap.activeRun && serverNow() >= snap.activeRun.deadline ? snap.activeRun : null;

  useEffect(() => {
    setProjectActive(stage === 'playing');
  }, [stage, setProjectActive]);

  const pop = (lane: number, text: string, tone: Pop['tone']) => {
    const id = popSeq.current++;
    setPops((p) => [...p.slice(-6), { id, lane, text, tone }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 900);
  };

  const breakCombo = (lane: number, label: string) => {
    const l = { ...liveRef.current };
    if (l.shieldLeft > 0) {
      l.shieldLeft--;
      pop(lane, `🛡️ 护盾抵消${label}`, 'shield');
    } else {
      l.combo = 0;
      pop(lane, `${label} 连击中断`, 'bad');
    }
    return l;
  };

  const begin = useCallback(
    (r: ProjectRunView) => {
      setRun(r);
      const saved = sessionStorage.getItem(actionsKey(r.id));
      actions.current = saved ? (JSON.parse(saved) as ProjectAction[]) : [];
      done.current = new Set(actions.current.map((a) => a.taskId));
      missed.current = new Set();
      setLive({ combo: 0, maxCombo: 0, score: 0, shieldLeft: r.skills.shield, hits: 0, misses: 0 });
      setResult(null);
      setError(null);
      setStage('playing');
    },
    [],
  );

  const start = async () => {
    setStage('starting');
    setError(null);
    try {
      const { run: r } = await api.startProject();
      begin(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '开始失败');
      setStage('error');
    }
  };

  const settle = useCallback(async () => {
    if (!run) return;
    setStage('settling');
    // 等到服务器时间到达截止时刻再提交（服务器拒绝提前结算）
    const wait = run.deadline - serverNow();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait + 120));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await api.finishProject(run.id, actions.current);
        sessionStorage.removeItem(actionsKey(run.id));
        setResult(r.result);
        setStage('result');
        toast({ tone: 'gold', title: `💰 紧急项目完成 +${r.result.total} 金币`, body: `最高连击 ${r.result.maxCombo}，技能加成 +${r.result.incomeBonus}` });
        void refresh();
        return;
      } catch (e) {
        if (e instanceof ApiError && e.code === 'TOO_EARLY') {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        setError(e instanceof ApiError ? e.message : '结算失败');
        setStage('error');
        void refresh();
        return;
      }
    }
  }, [run, refresh, toast]);

  // 游戏循环
  useEffect(() => {
    if (stage !== 'playing' || !run) return;
    let raf = 0;
    const loop = () => {
      const t = serverNow() - run.startedAt;
      setNow(t);
      // 过期未完成的任务 → 失误
      for (const task of tasks) {
        if (task.kind === 'trap' || done.current.has(task.id) || missed.current.has(task.id)) continue;
        if (t > task.spawnAt + task.ttl) {
          missed.current.add(task.id);
          const l = breakCombo(task.lane, '漏掉任务');
          l.misses++;
          setLive(l);
        }
      }
      if (t >= run.durationMs) {
        void settle();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, run, tasks, settle]);

  const hit = (task: ProjectTask) => {
    if (!run || stage !== 'playing' || done.current.has(task.id)) return;
    const t = Math.round(serverNow() - run.startedAt);
    if (t < task.spawnAt || t > task.spawnAt + task.ttl) return;
    const last = actions.current[actions.current.length - 1];
    if (last && t - last.t < 90) return; // 与服务端最小间隔一致
    done.current.add(task.id);
    actions.current.push({ taskId: task.id, t });
    sessionStorage.setItem(actionsKey(run.id), JSON.stringify(actions.current));
    if (task.kind === 'trap') {
      setLive(breakCombo(task.lane, '🥧 被画饼了！'));
      return;
    }
    const l = { ...liveRef.current };
    l.combo++;
    l.hits++;
    l.maxCombo = Math.max(l.maxCombo, l.combo);
    const pts = pointsForCombo(l.combo);
    l.score += pts;
    setLive(l);
    pop(task.lane, `+${pts}${l.combo > 1 ? ` ×${l.combo}连击` : ''}`, 'good');
  };

  // 键盘：1-5 对应五条泳道
  useEffect(() => {
    if (stage !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      const lane = Number(e.key) - 1;
      if (!(lane >= 0 && lane < LANES) || !run) return;
      const t = serverNow() - run.startedAt;
      const cand = tasks.find((k) => k.lane === lane && !done.current.has(k.id) && t >= k.spawnAt && t <= k.spawnAt + k.ttl);
      if (cand) hit(cand);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 恢复：刷新页面后若存在进行中的项目，继续
  useEffect(() => {
    const r = snap.activeRun;
    if (stage === 'idle' && r && serverNow() < r.deadline) begin(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const durationSec = projectDuration(sk) / 1000;

  if (stage === 'idle') {
    return (
      <div className="project-launch">
        {pending ? (
          <button
            className="btn project-btn"
            onClick={() => {
              setRun(pending);
              const saved = sessionStorage.getItem(actionsKey(pending.id));
              actions.current = saved ? (JSON.parse(saved) as ProjectAction[]) : [];
              void (async () => {
                setStage('settling');
                try {
                  const r = await api.finishProject(pending.id, actions.current);
                  setResult(r.result);
                  setStage('result');
                  void refresh();
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : '结算失败');
                  setStage('error');
                  void refresh();
                }
              })();
            }}
          >
            📮 结算上一个项目
          </button>
        ) : (
          <button className="btn project-btn" onClick={() => setStage('brief')} data-testid="btn-project">
            <span className="siren">🚨</span>
            <span>
              接紧急项目
              <small>
                {durationSec} 秒 · 收益 +{sk.incomePct}% · 护盾 ×{sk.shield}
              </small>
            </span>
          </button>
        )}
      </div>
    );
  }

  const remaining = run ? Math.max(0, run.durationMs - now) : 0;
  const visible = tasks.filter((t) => now >= t.spawnAt && now <= t.spawnAt + t.ttl && !done.current.has(t.id));

  return (
    <div className="project-overlay" role="dialog" aria-label="紧急项目" data-testid="project-overlay">
      {stage === 'brief' && (
        <div className="panel project-brief">
          <h3>🚨 紧急项目：甲方今晚就要！</h3>
          <ul>
            <li>
              点击（或按键 <kbd>1</kbd>–<kbd>5</kbd>）弹出的 📧🐞📅📊 任务卡完成工作，连续完成可叠加连击（每次 8 分起，最高 24 分）。
            </li>
            <li>
              别点 🥧「老板画的大饼」；漏掉任务或点到大饼会中断连击（有 🛡️ 护盾则抵消）。
            </li>
            <li>开始/结束时间由服务器记录，提前结算、重复领取、伪造点击均会被拒绝。</li>
          </ul>
          <div className="effects big">
            <span>⏱️ 时长 15{sk.timeSec ? ` + ${sk.timeSec}` : ''} = {durationSec} 秒</span>
            <span>💰 收益 +{sk.incomePct}%</span>
            <span>🛡️ 连击护盾 ×{sk.shield}</span>
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setStage('idle')}>
              再想想
            </button>
            <button className="btn primary" onClick={() => void start()} autoFocus data-testid="btn-project-start">
              开始！
            </button>
          </div>
        </div>
      )}
      {stage === 'starting' && <div className="panel project-brief center">⏳ 正在向服务器登记项目…</div>}
      {(stage === 'playing' || stage === 'settling') && run && (
        <div className="panel project-board">
          <div className="pb-top">
            <div className="timer">
              <b data-testid="project-timer">{(remaining / 1000).toFixed(1)}</b>s
            </div>
            <div className="timebar">
              <i style={{ width: `${(remaining / run.durationMs) * 100}%` }} />
            </div>
            <div className="pb-stats">
              <span className={`combo ${live.combo >= 5 ? 'hot' : ''}`}>连击 ×{live.combo}</span>
              <span>🛡️ {live.shieldLeft}</span>
              <span className="score" data-testid="project-score">
                {fmt(live.score)}
                <small>{run.skills.incomePct ? ` → ${fmt(Math.floor((live.score * (100 + run.skills.incomePct)) / 100))}` : ''}</small>
              </span>
            </div>
          </div>
          <div className="lanes">
            {Array.from({ length: LANES }, (_, lane) => (
              <div className="lane" key={lane}>
                <kbd className="lane-key">{lane + 1}</kbd>
                {visible
                  .filter((t) => t.lane === lane)
                  .map((t) => {
                    const meta = TASK_META[t.kind];
                    const life = 1 - (now - t.spawnAt) / t.ttl;
                    return (
                      <button
                        key={t.id}
                        className={`task ${t.kind === 'trap' ? 'trap' : ''}`}
                        style={{ ['--c' as string]: meta.color, ['--life' as string]: life }}
                        onPointerDown={() => hit(t)}
                        data-testid={`task-${t.kind}`}
                        data-task={t.id}
                        aria-label={meta.label}
                      >
                        <span className="ti">{meta.icon}</span>
                        <span className="tl">{meta.label}</span>
                        <i className="life" />
                      </button>
                    );
                  })}
                {pops
                  .filter((p) => p.lane === lane)
                  .map((p) => (
                    <span key={p.id} className={`pop ${p.tone}`}>
                      {p.text}
                    </span>
                  ))}
              </div>
            ))}
          </div>
          {stage === 'settling' && <div className="settling">⏳ 时间到！服务器结算中…</div>}
        </div>
      )}
      {stage === 'result' && result && (
        <div className="panel project-brief result" data-testid="project-result">
          <h3>✅ 项目交付！</h3>
          <div className="result-total">
            +<b>{fmt(result.total)}</b> 金币
          </div>
          <table className="split">
            <tbody>
              <tr>
                <td>完成任务</td>
                <td className="num">{result.hits}</td>
              </tr>
              <tr>
                <td>最高连击</td>
                <td className="num">{result.maxCombo}</td>
              </tr>
              <tr>
                <td>漏掉 / 被画饼</td>
                <td className="num">
                  {result.misses} / {result.traps}
                </td>
              </tr>
              <tr>
                <td>🛡️ 护盾抵消</td>
                <td className="num">{result.shieldsUsed}</td>
              </tr>
              <tr>
                <td>基础收益</td>
                <td className="num">{fmt(result.basePoints)}</td>
              </tr>
              <tr>
                <td>💰 技能加成（向下取整）</td>
                <td className="num">+{fmt(result.incomeBonus)}</td>
              </tr>
              {result.rejected > 0 && (
                <tr>
                  <td>服务器判定无效的操作</td>
                  <td className="num">{result.rejected}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="modal-actions">
            <button className="btn primary" onClick={() => setStage('idle')} autoFocus data-testid="btn-project-close">
              收下金币
            </button>
          </div>
        </div>
      )}
      {stage === 'error' && (
        <div className="panel project-brief" role="alert">
          <h3>⚠️ 项目出了点状况</h3>
          <p>{error}</p>
          <div className="modal-actions">
            <button className="btn primary" onClick={() => setStage('idle')}>
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
