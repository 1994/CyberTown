import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TeaEvent, TeaPlan, TeaRole, TeaRun, TeaStrategy, TeaWorker } from '../../shared/tea.ts';
import type { TeaLesson, TeaLiveFrame, TeaLiveHome, TeaOpenSession, TeaSession, TeaStep, TeaWorkRole } from '../../shared/teaLive.ts';
import { ApiError } from '../api.ts';
import { useGame } from '../store.ts';
import { teaApi } from './api.ts';
import { teaLiveApi } from './liveApi.ts';
import { useTeaAudio } from './useTeaAudio.ts';

type View = 'street' | 'prep' | 'play' | 'report' | 'ending';
const uid = () => crypto.randomUUID();
const message = (e: unknown) => e instanceof Error ? e.message : '暂时无法连接小镇';
interface SavedPlan { selected: string[]; roles: Record<string, TeaRole>; stock: TeaPlan['stock']; strategy: TeaStrategy }
function read<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; } }
function save(key: string, value: unknown) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional storage */ } }

/** The controller owns transport and the server clock; views cannot mint work or money. */
export function useTeaChapter() {
  const me = useGame(s => s.snapshot?.me);
  const logout = useGame(s => s.logout);
  const phoneOpen = useGame(s => s.phoneOpen);
  const player = me?.id ?? '';
  const [home, setHome] = useState<TeaLiveHome | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('prep');
  const [lesson, setLesson] = useState<TeaLesson>('rescue');
  const [selected, setSelected] = useState<string[]>([]);
  const [roles, updateRoles] = useState<Record<string, TeaRole>>({ self: 'support' });
  const [stock, updateStock] = useState<TeaPlan['stock']>(20);
  const [strategy, updateStrategy] = useState<TeaStrategy>('balanced');
  const [session, updateSession] = useState<TeaSession | null>(null);
  const [legacyRun, setLegacyRun] = useState<TeaRun | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [intent, setIntent] = useState<TeaWorkRole | null>(null);
  const [outside, setOutside] = useState(true);
  const current = useRef<TeaSession | null>(null);
  const locked = useRef(false);
  const pendingStep = useRef<{ id: string; input: TeaStep } | null>(null);
  const mounted = useRef(true);
  const planKey = `tea3-plan:${player}`;
  const openingKey = `tea3-opening:${player}`;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3600); return () => clearTimeout(t); }, [toast]);
  const setSession = useCallback((s: TeaSession | null) => {
    current.current = s;
    if (mounted.current) { updateSession(s); setLegacyRun(null); }
  }, []);
  const refresh = useCallback(async () => {
    const h = await teaLiveApi.home();
    if (mounted.current) { setHome(h); setError(''); }
    return h;
  }, []);
  useEffect(() => { if (phoneOpen) void refresh().catch(e => setToast(message(e))); }, [phoneOpen, refresh]);
  const restorePlan = useCallback((h: TeaLiveHome, s?: TeaSession) => {
    const stored = read<SavedPlan>(`tea3-plan:${h.playerId}`);
    const valid = new Set(h.workers.filter(w => w.enabled).map(w => w.id));
    const ids = s ? s.run.workers.filter(w => w.id !== 'self').map(w => w.id) : (stored?.selected ?? []).filter(id => valid.has(id)).slice(0, 2);
    setSelected(ids);
    updateRoles(s ? Object.fromEntries(s.run.plan.assignments.map(a => [a.workerId, a.role])) : stored?.roles ?? { self: 'support' });
    const options = h.business?.stockOptions ?? [20, 40, 60];
    updateStock(s?.run.plan.stock ?? (options.some(option => option === stored?.stock) ? stored!.stock : h.business?.recommendedStock ?? 20));
    updateStrategy(s?.run.plan.strategy ?? stored?.strategy ?? 'balanced');
  }, []);
  const load = useCallback(async () => {
    try {
      const h = await refresh();
      if (!mounted.current) return;
      if (h.chapter.activeSessionId) {
        const s = await teaLiveApi.get(h.chapter.activeSessionId);
        if (!mounted.current) return;
        restorePlan(h, s); setSession(s); setLesson(s.lesson); setView(s.status === 'active' ? 'play' : 'report'); setPaused(true);
        save(`tea3-opening:${h.playerId}`, null);
        return;
      }
      restorePlan(h); setSession(null);
      setLesson('rescue'); setView('prep');
    } catch (e) { if (mounted.current) setError(message(e)); }
  }, [refresh, restorePlan, setSession]);
  useEffect(() => { void load(); }, [load]);

  const pool = useMemo(() => home?.workers.filter(w => w.id !== 'self').map(w => lesson === 'rescue' ? { ...w, salary: Math.ceil(w.salary / 4) } : w) ?? [], [home, lesson]);
  const team = useMemo(() => home ? [home.self, ...selected.map(id => pool.find(w => w.id === id)).filter((w): w is TeaWorker => !!w)] : [], [home, selected, pool]);
  const hiresNeeded = lesson === 'rescue' ? 0 : lesson === 'solo' ? 0 : lesson === 'duo' ? 1 : 2;
  const totalCost = stock * 6 + 120 + team.reduce((n, w) => n + w.salary, 0);
  const active = session?.status === 'active';
  const problems = [
    lesson === 'rescue' && home?.mission.status === 'offered' ? '先在手机接下救店任务' : '',
    lesson !== 'free' && lesson !== 'rescue' && team.length !== hiresNeeded + 1 ? `还需招募 ${Math.max(0, hiresNeeded + 1 - team.length)} 位同事` : '',
    totalCost > (home?.business?.challenge.budget ?? home?.challenge.budget ?? 1100) ? '筹备费用超出预算' : '',
  ].filter(Boolean);
  useEffect(() => {
    if (home && !active) save(planKey, { selected, roles, stock, strategy } satisfies SavedPlan);
  }, [home, active, selected, roles, stock, strategy, planKey]);

  const pick = (id: string) => {
    if (current.current?.status === 'active' || lesson === 'solo') return;
    const w = pool.find(w => w.id === id);
    if (!w || !w.enabled) return;
    if (selected.includes(id)) { setSelected(selected.filter(x => x !== id)); return; }
    const max = lesson === 'duo' ? 1 : 2;
    const next = selected.length >= max ? [...selected.slice(1), id] : [...selected, id];
    const others = next.filter(x => x !== id).map(x => roles[x]);
    const role: TeaRole = lesson === 'duo' || !others.includes('maker') ? 'maker' : 'cashier';
    updateRoles(old => ({ ...old, [id]: role, self: 'support' })); setSelected(next);
  };
  // Hiring/recalling changes the authoritative pool asynchronously. Resolve from
  // the awaited response, never from a previous render's pool.
  const assignStaff = async (id: string) => {
    if (current.current?.status === 'active') throw new Error('本轮营业结束后再调整员工');
    const h = await refresh();
    const w = h.workers.find(w => w.id === id && w.enabled);
    if (!w) throw new Error('这位员工暂不能上岗，请先召回或取消转让');
    const available = new Set(h.workers.filter(w => w.enabled).map(w => w.id));
    const retained = selected.filter(id => available.has(id));
    if (retained.includes(id)) return;
    if (retained.length >= 2) throw new Error('本班已有 2 人，请先在店里换下一位');
    const taken = retained.map(x => roles[x]);
    const role: TeaRole = taken.includes('maker') ? 'cashier' : taken.includes('cashier') ? 'maker' : w.production >= w.service ? 'maker' : 'cashier';
    setSelected([...retained, id]);
    updateRoles(old => ({ ...old, [id]: role, self: 'support' }));
    setToast(`${w.name} 已安排${role === 'maker' ? '制作' : '端送'}，准备好再开店`);
  };
  const setRole = (id: string, role: TeaRole) => { if (!active) updateRoles(old => ({ ...old, [id]: role })); };
  const setStock = (n: TeaPlan['stock']) => { if (!active) updateStock(n); };
  const setStrategy = (s: TeaStrategy) => { if (!active) updateStrategy(s); };
  const goShop = () => { if (!active) setView('prep'); };
  const goStreet = () => { if (!active) setView('street'); };

  const start = async (mode: 'practice' | 'official') => {
    if (!home || locked.current || current.current?.status === 'active' || problems.length) return;
    const plan: TeaPlan = { assignments: team.map(w => ({ workerId: w.id, role: roles[w.id] ?? 'support' })), stock, strategy };
    const old = read<TeaOpenSession>(openingKey);
    const same = old && old.lesson === lesson && old.mode === mode && JSON.stringify(old.plan) === JSON.stringify(plan);
    const input: TeaOpenSession = same ? old : { plan, lesson, mode, idempotencyKey: uid() };
    save(openingKey, input); locked.current = true; setBusy(true);
    try {
      const s = await teaLiveApi.open(input);
      if (!mounted.current) return;
      setSession(s); pendingStep.current = null; setPaused(false); setSpeed(1); setToast('');
      setView(s.status === 'active' ? 'play' : 'report'); save(openingKey, null); await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === 'TEA_ACTIVE') { await load(); setToast('已恢复尚未结束的营业'); }
      else {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) save(openingKey, null);
        setToast(message(e) + (e instanceof ApiError && e.status === 0 ? '，可安全重试开门' : ''));
      }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };

  const step = useCallback(async (advance: number, assign?: TeaWorkRole) => {
    const s = current.current;
    if (!s || s.status !== 'active' || locked.current) return;
    if (assign && pendingStep.current) { setToast('先点继续营业，恢复连接'); return; }
    locked.current = true; setBusy(true);
    const request = pendingStep.current ?? { id: s.id, input: { revision: s.revision, advance, ...(assign ? { assign } : {}), requestId: uid() } };
    pendingStep.current = request;
    try {
      let next: TeaSession;
      try { next = await teaLiveApi.step(request.id, request.input); }
      catch (e) {
        // An ambiguous transport failure retries precisely the same operation.
        if (!(e instanceof ApiError) || (e.status !== 0 && e.status < 500)) throw e;
        next = await teaLiveApi.step(request.id, request.input);
      }
      pendingStep.current = null;
      if (!mounted.current) return;
      setSession(next);
      if (next.status === 'finished') { setView('report'); setPaused(false); await refresh(); }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && ['TEA_REVISION', 'TEA_FINISHED'].includes(e.code)) {
        pendingStep.current = null;
        try {
          const latest = await teaLiveApi.get(request.id); setSession(latest);
          if (latest.status === 'finished') { setView('report'); await refresh(); }
        } catch { setPaused(true); setToast('连接中断，点继续营业重试'); }
      } else if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        pendingStep.current = null; setToast(message(e));
      } else { setPaused(true); setToast('连接中断，点继续营业重试'); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, [refresh, setSession]);

  useEffect(() => {
    if (view !== 'play' || !active || paused || outside || phoneOpen) return;
    // Counter days run at real time. Older frozen lessons retain their original rate.
    // The request lock skips overlapping ticks during slow connections.
    const delay = (session?.run.challenge.flow?.startsWith('counter.') ? 1000 : lesson === 'solo' || lesson === 'duo' ? 500 : 250) / speed;
    const t = setInterval(() => { void step(1); }, delay);
    return () => clearInterval(t);
  }, [view, active, paused, outside, phoneOpen, lesson, speed, session?.run.challenge.flow, step]);
  useEffect(() => {
    if(!intent || busy) return;
    setIntent(null);
    if(!paused && !outside && active) void step(0,intent);
  },[intent,busy,paused,outside,active,step]);
  const assign = async (role: TeaWorkRole) => { setIntent(role); };
  const dismissGuide = async () => {
    try { const h = await teaLiveApi.dismissGuide(); if(mounted.current) setHome(h); }
    catch(e) { setToast(message(e)); }
  };
  const togglePause = () => setPaused(p => !p);
  const pause = () => setPaused(true);
  const acceptMission = async () => {
    if (locked.current) return; locked.current = true; setBusy(true);
    try { const h = await teaLiveApi.acceptMission(); if (mounted.current) { setHome(h); setToast('已接下：救救街角奶茶'); } }
    catch(e) { setToast(message(e)); }
    finally { locked.current=false; if(mounted.current) setBusy(false); }
  };
  const skip = async () => {
    if (locked.current) return;
    setPaused(true);
    if (pendingStep.current) await step(0);
    const s = current.current;
    if (s?.status === 'active') await step(s.run.challenge.duration - s.t);
  };
  const next = () => {
    if (active || !home) return;
    setLesson('rescue'); setSession(null); setView('prep');
    const options = home.business?.stockOptions ?? [20, 40, 60];
    if (!options.includes(stock)) updateStock(home.business?.recommendedStock ?? 20);
  };

  const upgrade = async () => {
    if (!home || locked.current || active || home.shop.level >= 3) return;
    const previousLevel = home.shop.level;
    const showUpgrade = (h: TeaLiveHome) => {
      setHome(h); updateStock(h.business?.recommendedStock ?? (h.shop.level >= 3 ? 60 : 40));
      setView('ending'); setToast('门店焕新完成');
    };
    locked.current = true; setBusy(true);
    try {
      showUpgrade(await teaApi.upgrade(previousLevel) as TeaLiveHome);
    }
    catch (e) {
      // A lost reply can hide a committed upgrade. Read the authoritative level
      // before offering a retry; never repeat the charge to discover the result.
      if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) {
        try {
          const h = await refresh();
          if (h.shop.level > previousLevel) { showUpgrade(h); return; }
        } catch { /* Keep the saved game and allow the same level-guarded retry. */ }
      }
      setToast(message(e));
    }
    finally { locked.current = false; setBusy(false); }
  };
  const openRun = async (id: string) => {
    if (active || locked.current) return;
    locked.current = true; setBusy(true);
    try {
      try { const s = await teaLiveApi.get(id); setSession(s); setLesson(s.lesson); }
      catch (e) {
        if (!(e instanceof ApiError) || e.status !== 404) throw e;
        setSession(null); setLegacyRun(await teaApi.getRun(id));
      }
      setView('report');
    } catch (e) { setToast(message(e)); }
    finally { locked.current = false; setBusy(false); }
  };
  const toggleHire = async () => {
    if (!home || locked.current) return;
    locked.current = true; setBusy(true);
    try { setHome(await teaApi.setHireEnabled(!home.hireEnabled) as TeaLiveHome); }
    catch (e) { setToast(message(e)); }
    finally { locked.current = false; setBusy(false); }
  };

  const run = session?.run ?? legacyRun;
  const frame: TeaLiveFrame | null = session?.frame ?? null;
  const events: TeaEvent[] = useMemo(() => run && frame ? run.result.events.filter(e => e.t <= frame.t && e.t > frame.t - 4) : [], [run, frame]);
  const supportAt: TeaRole | null = frame?.workersState.find(w => w.id === 'self')?.role === 'idle' ? null
    : (frame?.workersState.find(w => w.id === 'self')?.role as TeaRole | undefined) ?? null;
  const canAssign = !!active && view === 'play' && frame?.selfTask.queuedRole === null;
  const goal = view === 'play' ? frame?.selfTask.role !== 'idle' ? '这一批交给自己自动完成'
    : team.length >= 3 ? '同事自动营业，按需支援'
    : (frame.makerQueue > frame.cashierQueue && frame.makerQueue > 0) ? '点制作台，做一批饮品'
      : frame.cashierQueue > 0 ? '点前台，接待一批客人' : lesson === 'solo' ? '等第一位客人进店' : '同事会自动接活'
    : lesson === 'rescue' ? home?.business?.goal ?? (home?.mission.status === 'completed' ? '小店重新开张，继续自由经营' : '撑过这一班，让小店重新有收入')
      : home?.chapter.stage === 'upgrade' ? '用收益为小店换上新招牌'
      : view === 'ending' ? home?.shop.level === 3 ? '首店篇完成，继续探索商圈' : '第一章完成，同事接管日常'
        : lesson === 'solo' ? '独自做出第一杯奶茶'
          : lesson === 'duo' ? '招位同事，替你自动制作'
            : lesson === 'rush' ? selected.length < 2 ? '再招一位同事，接管前台' : '撑过高峰，完成72杯'
              : home?.shop.level === 3 ? '首店篇完成，继续探索商圈' : '升级到夜城茶饮旗舰';
  useTeaAudio({ view: outside ? 'street' : view === 'ending' ? 'report' : view, run, frame, shopLevel: home?.shop.level ?? 0, teamKey: selected.join('|') });

  return { home, business: home?.business, error, toast, busy, view, lesson, goal, hiresNeeded, team, pool, roles, stock, strategy, totalCost, problems,
    session, run, frame, events, supportAt, paused, speed, canAssign, dismissGuide, load, pick, assignStaff, setRole, setStock, setStrategy,
    goShop, goStreet, start, assign, togglePause, pause, setOutside, acceptMission, refresh, setSpeed, skip, next, upgrade, openRun, toggleHire, logout };
}
export type TeaChapterController = ReturnType<typeof useTeaChapter>;
