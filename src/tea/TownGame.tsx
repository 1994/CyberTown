import { useEffect, useRef, useState } from 'react';
import { CinematicOverlay } from '../ui/CinematicOverlay.tsx';
import { Smartphone } from 'lucide-react';
import { TEA_TOWN_SITES } from '../../shared/teaTown.ts';
import { SITE_IDS, TOWN_DESTINATIONS, type DestinationId, type SiteId } from '../../shared/townPlan.ts';
import { TOWN_OPPORTUNITIES } from '../../shared/townExplore.ts';
import { teaLiveApi } from './liveApi.ts';
import { MAP_VIEW_LABEL, TownMap, type MapView } from './TownMap.tsx';
import { OfficeCanvas } from '../scene/Office.tsx';
import { useGame } from '../store.ts';
import { Joystick } from '../ui/Joystick.tsx';
import { SoundMenu } from '../ui/SoundControl.tsx';
import { useTouchUi } from '../ui/useTouchUi.ts';
import { walkNear } from '../world/navigation.ts';
import { rt, useWorld } from '../world/runtime.ts';
import { TeaGame } from './TeaGame.tsx';
import { HiringHall } from './HiringHall.tsx';
import { useTownState } from './townState.ts';
import { TownPhone, type PhoneTab } from './TownPhone.tsx';
import { TownArrival, TownPresence, arrivalSeen, markArrival, useWorldReady } from './TownArrival.tsx';
import { useTownLook } from './TownLandmarks.tsx';
import { useTeaChapter } from './useTeaChapter.ts';
import '../sound.css';
import './tea.css';
import './town.css';

// 大地图主线：TownGame 唯一持有 useTeaChapter；地图位置/室内由这里管理，营业规则全在 controller 与服务端。
type Place = 'map' | 'recruit' | 'shop';
type Site = 'shop' | 'recruit';
const SITES = TEA_TOWN_SITES;
const distTo = (s: Site) => Math.hypot(rt.me.x - SITES[s].x, rt.me.z - SITES[s].z);
const DEST = TOWN_DESTINATIONS;
const distDest = (d: DestinationId) => Math.hypot(rt.me.x - DEST[d].x, rt.me.z - DEST[d].z);
// 交互点沿用各自范围；街区目的地走到 2.2m 内即算到达
const reach = (d: DestinationId) => d === 'shop' || d === 'recruit' ? SITES[d].range : 2.2;
/** 考察按钮出现距离（服务端校验 4.2m，前端更保守） */
const SURVEY_RANGE = 2.8;
const DEST_ORDER: DestinationId[] = ['shop', 'leisure', 'plaza', 'recruit'];
const DEST_LABEL: Record<DestinationId, string> = {
  shop: '商业街 · 奶茶店', leisure: '娱乐街', plaza: '回广场', recruit: '雇佣大厅',
  ...Object.fromEntries(TOWN_OPPORTUNITIES.map(o => [o.id, o.name])) as Record<SiteId, string>,
};

export function TownGame() {
  const myId = useGame(s => s.snapshot!.me.id);
  const introPlaying = useGame(s => s.introPlaying);
  const c = useTeaChapter();
  const { home } = c;
  const touch = useTouchUi();
  const placeKey = `town-place:${myId}`;
  // 只记住“在店里”这一件事，刷新后回到同一处（营业 session 由 controller 从服务端恢复）
  const [place, setPlaceState] = useState<Place>(() => { if (useGame.getState().introPlaying) return 'map'; try { return localStorage.getItem(placeKey) === 'shop' ? 'shop' : 'map'; } catch { return 'map'; } });
  const setPlace = (p: Place) => {
    setPlaceState(p);
    try { if (p === 'shop') localStorage.setItem(placeKey, 'shop'); else localStorage.removeItem(placeKey); } catch { /* 仅为便利 */ }
  };
  useEffect(() => {
    if (useGame.getState().introPlaying) { try { localStorage.removeItem(placeKey); } catch { /* 不影响入场 */ } }
  }, [placeKey]);
  // 手机开关与原世界共用 useGame.phoneOpen（P 键 / Esc 同一套），这里只记当前页签
  const phoneOpen = useGame(s => s.phoneOpen);
  const [tab, setTab] = useState<PhoneTab>('home');
  const openPhone = (t: PhoneTab) => { setTab(t); useGame.getState().openPhone(); };
  const closePhone = () => useGame.getState().closePhone();
  const phone = phoneOpen ? tab : null;
  const [notice, setNotice] = useState(true);
  const worldReady = useWorldReady(myId);
  const conn = useGame(s => s.conn);
  const ready = worldReady && conn === 'live';
  // 明确点击进入时在片头后显示简短指引；刷新沿用 seen，不反复打断。右上「?」可重开。
  const [arrival, setArrival] = useState(() => (useGame.getState().introPlaying || !arrivalSeen(myId)) && place === 'map');
  const closeArrival = () => { markArrival(myId); setArrival(false); };
  const [map, setMap] = useState(false);
  const [near, setNear] = useState<Site | null>(null);
  const [travel, setTravel] = useState<DestinationId | null>(null);
  const [arrived, setArrived] = useState<DestinationId | null>(null);
  // go() 创建的路线引用：地面点击/键盘/摇杆换掉或清空它 = 取消这次带路（逐点 shift 同一数组不算）
  const travelPath = useRef<[number, number][] | null>(null);
  const [far, setFar] = useState(0);
  const [mapView, setMapView] = useState<MapView>('all');
  const [nearSite, setNearSite] = useState<SiteId | null>(null);
  const [survey, setSurvey] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  const [hint, setHint] = useState('');

  const mission = home?.mission.status ?? null;
  // 打开手机即视为看过；在店内只是不显示，不记 seen
  useEffect(() => { if (arrival && phoneOpen) closeArrival(); });
  const hires = c.team.filter(w => w.id !== home?.self.id).length;
  const live = c.view === 'play' && c.session?.status === 'active';

  const { setOutside } = c;
  useEffect(() => { setOutside(place !== 'shop'); }, [place, setOutside]);

  // 场景外观：等级、任务状态、当前导航目标
  // 已考察据点只认服务端 home.exploration；数据缺失时视为未知，不伪造
  const exploration = home?.exploration;
  const visited = exploration?.opportunities.filter(o => o.visitedAt > 0).map(o => o.id) ?? [];
  const visitedKey = visited.join('|');
  useEffect(() => { useTownLook.setState({ level: home?.shop.level ?? 1, mission, target: travel, visited: visitedKey ? visitedKey.split('|') : [] }); }, [home?.shop.level, mission, travel, visitedKey]);

  // 5Hz：判断是否走到交互点、导航是否到达/被玩家自己的操作取消
  useEffect(() => {
    if (place === 'shop') return;
    const id = setInterval(() => {
      const n: Site | null = distTo('shop') <= SITES.shop.range ? 'shop' : distTo('recruit') <= SITES.recruit.range ? 'recruit' : null;
      setNear(n);
      let site: SiteId | null = null;
      for (const id of SITE_IDS) if (distDest(id) <= SURVEY_RANGE) site = id;
      setNearSite(site);
      if (travel) {
        const d = distDest(travel);
        // 只在真实可交互/到达范围内算到达；路线被换掉或清空即取消
        if (d <= reach(travel)) { setArrived(travel); setTravel(null); travelPath.current = null; }
        else if (rt.path !== travelPath.current) { setTravel(null); travelPath.current = null; }
        else setFar(f => { const m = Math.round(d); return f === m ? f : m; });
      } else if (arrived && distDest(arrived) > reach(arrived) + 1.5) setArrived(null);
    }, 200);
    return () => clearInterval(id);
  }, [place, travel, arrived]);

  // 离开据点就清掉上次的错误提示
  useEffect(() => { setSurvey({ busy: false, error: '' }); }, [nearSite]);
  const doSurvey = async (id: SiteId) => {
    if (survey.busy) return;
    setSurvey({ busy: true, error: '' });
    try {
      await teaLiveApi.explore(id);
      await c.refresh();
      setSurvey({ busy: false, error: '' });
    } catch (e) {
      setSurvey({ busy: false, error: e instanceof Error ? e.message : '考察失败，再试一次' });
    }
  };

  // 招募面板、店内时锁住地图移动（手机由 openPhone 自带 phone 锁）
  const away = place !== 'map';
  useEffect(() => {
    if (!away) return;
    useWorld.getState().lock('town');
    return () => useWorld.getState().unlock('town');
  }, [away]);
  const locked = away || phoneOpen || introPlaying;

  // 小镇模式不挂旧抽屉/小游戏/庆祝弹窗：旧世界对象若把它们置位，会变成看不见又关不掉的输入锁，这里直接复位
  useEffect(() => {
    const reset = () => {
      const g = useGame.getState();
      if (g.drawer || g.projectActive || g.celebration) useGame.setState({ drawer: null, projectActive: false, celebration: null });
      if (useWorld.getState().projectOpen) useWorld.getState().setProjectOpen(false);
    };
    reset();
    const a = useGame.subscribe(reset);
    const b = useWorld.subscribe(s => { if (s.projectOpen) s.setProjectOpen(false); });
    useTownLook.setState({ active: true });
    return () => { a(); b(); useTownLook.setState({ active: false }); };
  }, []);

  useEffect(() => { if (!hint) return; const t = setTimeout(() => setHint(''), 2600); return () => clearTimeout(t); }, [hint]);

  const enter = (s: Site) => {
    if (distTo(s) > SITES[s].range + 0.3) { setHint('再走近一点'); return; }
    rt.path = null;
    setTravel(null);
    if (s === 'recruit') { setHallTab('candidates'); setPlace('recruit'); }
    else { c.goShop(); setPlace('shop'); }
  };
  // E 键 / 手机互动：复用原世界的 world-interact 事件
  useEffect(() => {
    if (place !== 'map' || !near) return;
    const on = () => enter(near);
    window.addEventListener('world-interact', on);
    return () => window.removeEventListener('world-interact', on);
  });

  // 导航：只设置真实寻路，不瞬移、不自动开店
  const go = (s: DestinationId) => {
    closePhone();
    setNotice(false);
    setMap(false);
    useWorld.getState().setOverview(false);
    if (distDest(s) <= reach(s)) { rt.path = null; rt.npcNavigation = null; travelPath.current = null; setTravel(null); setArrived(s); setHint(s === 'shop' || s === 'recruit' ? `已在${DEST[s].name}，点下方按钮` : `已在${DEST[s].name}`); return; }
    walkNear(DEST[s].x, DEST[s].z);
    if (!rt.path) { setHint('这里走不过去，换个位置再试'); return; }
    travelPath.current = rt.path;
    setArrived(null);
    setFar(Math.round(distDest(s)));
    setTravel(s);
  };
  useEffect(() => { if (!arrived) return; const t = setTimeout(() => setArrived(null), 3000); return () => clearTimeout(t); }, [arrived]);

  // 雇佣大厅：地图招募点 / 手机“员工” / 筹备缺员工入口都进同一个大厅；关闭回地图，不自动营业
  const [hallTab, setHallTab] = useState<'candidates' | 'staff' | 'market'>('candidates');
  const syncTea = () => { void c.refresh().catch(() => undefined); };
  // 5s 的 TownHome 轮询带来派工收入/升级/挂牌变化时，同步奶茶侧钱包与可排员工（c.refresh，不重置营业/计划）
  const townKey = useTownState(s => s.home ? `${s.home.coins}|${s.home.clones.map(x => `${x.id}:${x.level}:${x.xp}:${x.job?.kind ?? ''}:${x.listingId ?? ''}`).join(',')}` : '');
  const { refresh: teaRefresh } = c;
  const firstKey = useRef(true);
  useEffect(() => {
    if (!townKey) return;
    if (firstKey.current) { firstKey.current = false; return; }
    void teaRefresh().catch(() => undefined);
  }, [townKey, teaRefresh]);
  const openHall = (tab: 'candidates' | 'staff') => {
    closePhone(); setMap(false); rt.path = null; travelPath.current = null; setTravel(null);
    if (place === 'shop' && live) c.pause();
    setHallTab(tab); setPlace('recruit');
  };

  const exitShop = () => {
    // 回地图：活动营业先暂停，回来按“继续”恢复同一 session
    if (live) c.pause();
    setPlace('map');
  };

  const phoneUi = phone && home && <TownPhone home={home} tab={phone} onTab={setTab} onClose={closePhone} busy={c.busy}
    hires={hires} toast={c.toast} onAccept={c.acceptMission} onGo={s => { if (place === 'shop') exitShop(); go(s); }} onHall={() => openHall('staff')} />;

  if (place === 'shop') return <>
    <TeaGame controller={c} onExit={exitShop} onPhone={() => openPhone('home')} onHall={() => openHall('staff')} />
    {phoneUi && <div className="town town-over">{phoneUi}</div>}
  </>;

  const offered = mission === 'offered';
  // 操作指引卡：服务端世界里有自己即可显示（短暂断线也能重开）；手机/小地图打开时让位
  const guided = !introPlaying && worldReady && !!home && arrival && place === 'map' && !phone && !map;

  return <div className="town" data-testid="town-world">
    <OfficeCanvas myId={myId} covered={!!phone || place === 'recruit'} />
    <div inert={introPlaying} aria-hidden={introPlaying} style={introPlaying ? { visibility: 'hidden' } : undefined} className={`hud town-hud ${touch ? 'touch-ui' : ''}`}>
      <header className="town-top">
        <div className="tea-brand">赛博<b>小镇</b></div>
        <button className="town-coins" onClick={() => openPhone('wallet')} aria-label="钱包">
          <i className="coin sm" /><b>{home ? home.wallet.balance : '…'}</b>
        </button>
        <div className="town-tools">
          <SoundMenu className="tea-sound" />
          <button className={`town-chip ${map ? 'on' : ''}`} onClick={() => setMap(v => !v)} aria-expanded={map} aria-label="小地图">地图</button>
          <button className="town-chip town-help" onClick={() => { setMap(false); setArrival(true); }} aria-label="操作指引" data-testid="town-guide-help">?</button>
          <button className="town-chip town-phone-btn" onClick={() => openPhone('home')} aria-label="手机" aria-expanded={phoneOpen} disabled={!home}
            data-testid="town-phone-trigger" data-guided={guided ? 'true' : undefined} aria-describedby={guided ? 'town-guide-phone' : undefined}>
            <Smartphone size={16} aria-hidden /><span>手机</span>{!touch && <kbd>P</kbd>}{offered && <i className="town-dot" />}
          </button>
        </div>
      </header>

      {map && home && <div className="town-map" role="dialog" aria-label="小镇地图">
        <header><b>小镇地图</b>
          {exploration
            ? <span className="town-explore-chip" data-testid="town-exploration-progress" data-visited={exploration.visited} data-total={exploration.total}>商圈 {exploration.visited}/{exploration.total}</span>
            : <span className="town-explore-chip dim">商圈加载中</span>}
          <button className="town-x" onClick={() => setMap(false)} aria-label="收起地图" data-testid="town-map-close">×</button></header>
        <nav className="town-mapviews" aria-label="地图视图">
          {(Object.keys(MAP_VIEW_LABEL) as MapView[]).map(v => <button key={v} className={mapView === v ? 'on' : ''} aria-pressed={mapView === v}
            onClick={() => setMapView(v)} data-testid="town-map-view" data-view={v}>{MAP_VIEW_LABEL[v]}</button>)}
        </nav>
        <TownMap target={travel} view={mapView} visited={visited} onWalk={() => { setTravel(null); setArrived(null); }} />
        <div className="town-dests">
          <small>老镇</small>
          {DEST_ORDER.map(d => <button key={d} className={`tea-btn ${d === 'shop' ? 'primary' : ''} dest-${d}`} onClick={() => go(d)}
            data-testid={`town-map-destination-${d}`}>{DEST_LABEL[d]}</button>)}
          <small>商圈据点</small>
          {SITE_IDS.map(d => <button key={d} className={`tea-btn dest-site ${visited.includes(d) ? 'done' : ''}`} onClick={() => go(d)}
            data-testid={`town-map-destination-${d}`}>{visited.includes(d) ? '✓ ' : ''}{DEST_LABEL[d]}</button>)}
        </div>
      </div>}

      {/* 地图打开时让位：位置条与通知不盖住地图 */}
      {!map && <TownPresence myId={myId} ready={worldReady} collapsed={guided} />}

      {guided &&
        <TownArrival myId={myId} touch={touch} onClose={closeArrival} onPhone={() => { closeArrival(); setNotice(false); openPhone('mission'); }} />}

      {ready && !arrival && !map && home && notice && offered && !phone && place === 'map' && <div className="town-notice" role="status">
        <button className="town-notice-main" onClick={() => { setNotice(false); openPhone('mission'); }}>
          <b>📱 手机</b><span>有新任务，打开看看</span>
        </button>
        <button className="town-x" onClick={() => setNotice(false)} aria-label="稍后再说">×</button>
      </div>}

      {(travel || arrived) && <div className={`town-travel ${travel ? '' : 'done'}`} role="status" data-testid="town-navigation"
        data-target={travel ?? arrived ?? undefined} data-status={travel ? 'walking' : 'arrived'}>
        {travel
          ? <><span>前往 <b>{DEST[travel].name}</b> · {far}m</span>
            <button onClick={() => { rt.path = null; travelPath.current = null; setTravel(null); }} aria-label="取消带路">×</button></>
          : <span>已到达 <b>{DEST[arrived!].name}</b></span>}
      </div>}

      {live && <button className="town-resume" onClick={() => go('shop')}>营业已暂停 · 回店继续</button>}

      {place === 'map' && near && <div className="town-interact">
        {near === 'shop'
          ? <button className="tea-btn primary" onClick={() => enter('shop')} data-testid="town-enter-shop">
            进{['街角奶茶', '霓虹奶茶', '夜城茶饮旗舰'][(home?.shop.level ?? 1) - 1] ?? '奶茶店'}{!touch && <kbd>E</kbd>}</button>
          : <button className="tea-btn" onClick={() => enter('recruit')} data-testid="town-recruit">
            进雇佣大厅 <small>可选</small>{!touch && <kbd>E</kbd>}</button>}
      </div>}

      {place === 'map' && nearSite && !map && !phone && !guided && <SurveyCard id={nearSite} home={home} busy={survey.busy} error={survey.error} onSurvey={() => void doSurvey(nearSite)} />}


      {touch && !locked && <Joystick />}
      {(hint || c.toast) && <div className="tea-toast" role="status">{hint || c.toast}</div>}
      {c.error && <div className="tea-banner">{c.error}<button onClick={() => void c.load()}>刷新</button></div>}
    </div>
    <CinematicOverlay />
    {phoneUi}
    {place === 'recruit' && <HiringHall initialTab={hallTab} onClose={() => setPlace('map')} onChanged={syncTea}
      onShop={id => {
        // 召回的店员：选入本班（只在 controller 可排名单里时）并带路去奶茶店，不自动营业
        if (c.pool.some(w => w.id === id) && !c.team.some(t => t.id === id)) c.pick(id);
        setPlace('map'); go('shop');
      }} />}
  </div>;
}

/** 据点考察卡：走到 2.8m 内出现，显式点按钮才请求；奖励/已考察只认服务端。 */
function SurveyCard({ id, home, busy, error, onSurvey }: { id: SiteId; home: ReturnType<typeof useTeaChapter>['home']; busy: boolean; error: string; onSurvey: () => void }) {
  const info = TOWN_OPPORTUNITIES.find(o => o.id === id)!;
  const state = home?.exploration?.opportunities.find(o => o.id === id);
  const done = !!state && state.visitedAt > 0;
  const status = !home?.exploration ? 'loading' : busy ? 'busy' : done ? 'done' : error ? 'error' : 'ready';
  return <section className={`town-survey ${done ? 'done' : ''}`} data-testid="town-survey" data-site={id} data-state={status} aria-label={`${info.name}考察`}>
    <header><small>{info.district === 'commerce' ? '商业区据点' : '娱乐区据点'}</small><b>{info.name}</b></header>
    {status === 'loading' && <p>商圈数据加载中，稍后再试</p>}
    {done && <p className="town-insight">已考察 · {state!.insight || info.insight}</p>}
    {!done && home?.exploration && <>
      <p>记录客流与租金，为连锁选址做准备</p>
      <button className="tea-btn primary" disabled={busy} onClick={onSurvey}>{busy ? '考察中…' : `考察 +${info.reward} 金币`}</button>
    </>}
    {error && <p className="tea-hint bad" role="alert">{error}，可重试</p>}
  </section>;
}
