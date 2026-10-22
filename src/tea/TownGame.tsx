import { useEffect, useState } from 'react';
import { TEA_TOWN_SITES } from '../../shared/teaTown.ts';
import { OfficeCanvas } from '../scene/Office.tsx';
import { useGame } from '../store.ts';
import { Joystick } from '../ui/Joystick.tsx';
import { Minimap } from '../ui/Minimap.tsx';
import { SoundMenu } from '../ui/SoundControl.tsx';
import { useTouchUi } from '../ui/useTouchUi.ts';
import { walkNear } from '../world/navigation.ts';
import { rt, useWorld } from '../world/runtime.ts';
import { TeaGame, WorkerCard } from './TeaGame.tsx';
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

export function TownGame() {
  const myId = useGame(s => s.snapshot!.me.id);
  const c = useTeaChapter();
  const { home } = c;
  const touch = useTouchUi();
  const placeKey = `town-place:${myId}`;
  // 只记住“在店里”这一件事，刷新后回到同一处（营业 session 由 controller 从服务端恢复）
  const [place, setPlaceState] = useState<Place>(() => { try { return localStorage.getItem(placeKey) === 'shop' ? 'shop' : 'map'; } catch { return 'map'; } });
  const setPlace = (p: Place) => {
    setPlaceState(p);
    try { if (p === 'shop') localStorage.setItem(placeKey, 'shop'); else localStorage.removeItem(placeKey); } catch { /* 仅为便利 */ }
  };
  // 手机开关与原世界共用 useGame.phoneOpen（P 键 / Esc 同一套），这里只记当前页签
  const phoneOpen = useGame(s => s.phoneOpen);
  const [tab, setTab] = useState<PhoneTab>('mission');
  const openPhone = (t: PhoneTab) => { setTab(t); useGame.getState().openPhone(); };
  const closePhone = () => useGame.getState().closePhone();
  const phone = phoneOpen ? tab : null;
  const [notice, setNotice] = useState(true);
  const worldReady = useWorldReady(myId);
  const conn = useGame(s => s.conn);
  const ready = worldReady && conn === 'live';
  // 到达引导：每个会话+玩家只出现一次；已接任务/在店的老玩家直接视为看过
  const [arrival, setArrival] = useState(() => !arrivalSeen(myId) && place === 'map');
  const [listOpen, setListOpen] = useState(false);
  const closeArrival = () => { markArrival(myId); setArrival(false); };
  const [map, setMap] = useState(false);
  const [near, setNear] = useState<Site | null>(null);
  const [travel, setTravel] = useState<Site | null>(null);
  const [far, setFar] = useState(0);
  const [hint, setHint] = useState('');

  const mission = home?.mission.status ?? null;
  useEffect(() => { if (arrival && (place === 'shop' || phoneOpen || (mission && mission !== 'offered'))) closeArrival(); });
  const hires = c.team.filter(w => w.id !== home?.self.id).length;
  const live = c.view === 'play' && c.session?.status === 'active';

  const { setOutside } = c;
  useEffect(() => { setOutside(place !== 'shop'); }, [place, setOutside]);

  // 场景外观：等级、任务状态、当前导航目标
  useEffect(() => { useTownLook.setState({ level: home?.shop.level ?? 1, mission, target: travel }); }, [home?.shop.level, mission, travel]);

  // 5Hz：判断是否走到交互点、导航是否到达/被玩家自己的操作取消
  useEffect(() => {
    if (place === 'shop') return;
    const id = setInterval(() => {
      const n: Site | null = distTo('shop') <= SITES.shop.range ? 'shop' : distTo('recruit') <= SITES.recruit.range ? 'recruit' : null;
      setNear(n);
      setTravel(t => {
        if (!t) return t;
        if (n === t) return null;
        if (!rt.path) return null;
        return t;
      });
      setFar(f => { const d = travel ? Math.round(distTo(travel)) : 0; return f === d ? f : d; });
    }, 200);
    return () => clearInterval(id);
  }, [place, travel]);

  // 招募面板、店内时锁住地图移动（手机由 openPhone 自带 phone 锁）
  const away = place !== 'map';
  useEffect(() => {
    if (!away) return;
    useWorld.getState().lock('town');
    return () => useWorld.getState().unlock('town');
  }, [away]);
  const locked = away || phoneOpen;

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
    if (s === 'recruit') { c.goStreet(); setPlace('recruit'); }
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
  const go = (s: Site) => {
    closePhone();
    setNotice(false);
    useWorld.getState().setOverview(false);
    if (distTo(s) <= SITES[s].range) { setTravel(null); setHint(`已在${SITES[s].name}，点下方按钮`); return; }
    walkNear(SITES[s].x, SITES[s].z);
    if (!rt.path) { setHint('这里走不过去，换个位置再试'); return; }
    setTravel(s);
  };

  const exitShop = () => {
    // 回地图：活动营业先暂停，回来按“继续”恢复同一 session
    if (live) c.pause();
    setPlace('map');
  };

  const phoneUi = phone && home && <TownPhone home={home} tab={phone} onTab={setTab} onClose={closePhone} busy={c.busy}
    hires={hires} onAccept={c.acceptMission} onGo={s => { if (place === 'shop') exitShop(); go(s); }} />;

  if (place === 'shop') return <>
    <TeaGame controller={c} onExit={exitShop} onPhone={() => openPhone('mission')} />
    {phoneUi && <div className="town town-over">{phoneUi}</div>}
  </>;

  const offered = mission === 'offered';
  const marks = [
    { x: SITES.shop.x, z: SITES.shop.z, color: '#ff7ab8', icon: '🧋', hot: travel === 'shop' || mission === 'accepted' },
    { x: SITES.recruit.x, z: SITES.recruit.z, color: '#3ef0ff', icon: '🙋', hot: travel === 'recruit' },
  ];

  return <div className="town" data-testid="town-world">
    <OfficeCanvas myId={myId} covered={!!phone || place === 'recruit'} />
    <div className={`hud town-hud ${touch ? 'touch-ui' : ''}`}>
      <header className="town-top">
        <div className="tea-brand">赛博<b>小镇</b></div>
        <button className="town-coins" onClick={() => openPhone('wallet')} aria-label="钱包">
          <i className="coin sm" /><b>{home ? home.wallet.balance : '…'}</b>
        </button>
        <div className="town-tools">
          <SoundMenu className="tea-sound" />
          <button className={`town-chip ${map ? 'on' : ''}`} onClick={() => setMap(v => !v)} aria-expanded={map} aria-label="小地图">地图</button>
          <button className="town-chip town-phone-btn" onClick={() => openPhone('mission')} aria-label="手机" aria-expanded={phoneOpen} disabled={!home}>
            手机{offered && <i className="town-dot" />}
          </button>
        </div>
      </header>

      {map && home && <div className="town-map">
        <Minimap marks={marks} onNavigate={() => setTravel(null)} />
        <div className="town-row">
          <button className="tea-btn" onClick={() => { setMap(false); go('recruit'); }}>去广场</button>
          <button className="tea-btn primary" onClick={() => { setMap(false); go('shop'); }}>去奶茶店</button>
        </div>
      </div>}

      <TownPresence myId={myId} ready={worldReady} onOpenChange={setListOpen} />

      {ready && home && arrival && place === 'map' && !phone && !map && !listOpen &&
        <TownArrival myId={myId} touch={touch} onClose={closeArrival} onPhone={() => { closeArrival(); setNotice(false); openPhone('mission'); }} />}

      {ready && !arrival && home && notice && offered && !phone && place === 'map' && <div className="town-notice" role="status">
        <button className="town-notice-main" onClick={() => { setNotice(false); openPhone('mission'); }}>
          <b>📱 街角奶茶</b><span>快倒闭了，来帮个忙</span>
        </button>
        <button className="town-x" onClick={() => setNotice(false)} aria-label="稍后再说">×</button>
      </div>}

      {travel && <div className="town-travel" role="status">
        <span>前往 <b>{SITES[travel].name}</b> · {far}m</span>
        <button onClick={() => { rt.path = null; setTravel(null); }} aria-label="取消带路">×</button>
      </div>}

      {live && <button className="town-resume" onClick={() => go('shop')}>营业已暂停 · 回店继续</button>}

      {place === 'map' && near && <div className="town-interact">
        {near === 'shop'
          ? <button className="tea-btn primary" onClick={() => enter('shop')} data-testid="town-enter-shop">
            进{['街角奶茶', '霓虹奶茶', '夜城茶饮旗舰'][(home?.shop.level ?? 1) - 1] ?? '奶茶店'}{!touch && <kbd>E</kbd>}</button>
          : <button className="tea-btn" onClick={() => enter('recruit')} data-testid="town-recruit">
            招帮手 <small>可选</small>{!touch && <kbd>E</kbd>}</button>}
      </div>}

      {place === 'recruit' && home && <section className="tea-panel town-recruit" aria-label="广场招募">
        <header><b>广场招募</b><span>可选 0–2 人 · 短班工资</span></header>
        <div className="tea-cards">
          {c.pool.map(w => {
            const on = c.team.some(h => h.id === w.id);
            return <WorkerCard key={w.id} w={w} on={on} onClick={() => c.pick(w.id)} disabled={live || (!on && (!w.enabled || w.remaining <= 0))} />;
          })}
        </div>
        <div className="town-row">
          <span className="tea-mini">已带 {hires}/2</span>
          <button className="tea-btn primary" onClick={() => setPlace('map')}>好了，回地图</button>
        </div>
      </section>}

      {touch && !locked && <Joystick />}
      {(hint || c.toast) && <div className="tea-toast" role="status">{hint || c.toast}</div>}
      {c.error && <div className="tea-banner">{c.error}<button onClick={() => void c.load()}>刷新</button></div>}
    </div>
    {phoneUi}
  </div>;
}
