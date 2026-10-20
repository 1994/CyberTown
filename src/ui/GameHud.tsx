import { dressed, dressedColleague } from '../look.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColleagueView, EmoteKind } from '../../shared/types.ts';
import { MAX_TEAM, projectDuration } from '../../shared/rules.ts';
import { zoneAt } from '../../shared/world.ts';
import { api, ApiError } from '../api.ts';
import { myTeam, useGame } from '../store.ts';
import { rt, useWorld, worldNow } from '../world/runtime.ts';
import type { Near } from '../world/runtime.ts';
import { Avatar } from './Avatar.tsx';
import { clipCodepoints, fmt } from './common.tsx';
import {
  ConfirmTrade,
  blockReason,
  displayName,
  skillShort,
} from './Confirm.tsx';
import { Minimap } from './Minimap.tsx';
import { Joystick } from './Joystick.tsx';
import { CinematicOverlay } from './CinematicOverlay.tsx';
import { useCinema } from '../scene/cinema.ts';
import { Drawers } from './Drawers.tsx';
import { ProjectGame } from './ProjectGame.tsx';
import {
  Progression,
  WalletCard,
  YearCard,
  QuickSquad,
} from './Progression.tsx';
import {
  Coffee,
  Crown,
  Gamepad2,
  Map,
  Menu,
  MessageCircle,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react';

const isTouch =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(pointer: coarse)').matches;

// ───────────────────── 左上：我 + 小队 ─────────────────────

// ───────────────────── 右上：地图 + 菜单 ─────────────────────

function MapPanel() {
  const overview = useWorld((s) => s.overview);
  const setOverview = useWorld((s) => s.setOverview);
  const unread = useGame((s) => s.snapshot?.unread ?? 0);
  const [menu, setMenu] = useState(false);
  const [map, setMap] = useState(false);
  const setDrawer = useGame((s) => s.setDrawer);
  const logout = useGame((s) => s.logout);
  const replayIntro = useGame((s) => s.replayIntro);
  const [zone, setZone] = useState('共享广场');
  useEffect(() => {
    const id = setInterval(
      () => setZone(zoneAt(rt.me.x, rt.me.z)?.name ?? '园区'),
      500,
    );
    return () => clearInterval(id);
  }, []);
  const open = (d: Parameters<typeof setDrawer>[0]) => {
    setMenu(false);
    setDrawer(d);
  };
  return (
    <section className="map-panel">
      {map && (
        <div className="map-fold">
          <header>
            <b>今天，想去哪里？</b>
            <button
              className="v3-icon"
              onClick={() => setMap(false)}
              aria-label="收起地图"
            >
              <X size={15} />
            </button>
          </header>
          <Minimap />
          <button
            className="text-btn"
            onClick={() => setOverview(!overview)}
            data-testid="btn-overview"
          >
            {overview ? '回到我身边' : '看看整个园区'}
          </button>
        </div>
      )}
      <div className="map-bar">
        <span className="zone-name" data-testid="zone-name">
          {zone}
        </span>
        <button
          className={`chip-btn ${map ? 'on' : ''}`}
          onClick={() => setMap((v) => !v)}
          aria-label="园区地图"
          aria-expanded={map}
          data-testid="btn-map"
        >
          <Map size={17} />
        </button>
        <button
          className="chip-btn"
          onClick={() => setMenu((v) => !v)}
          aria-label="更多菜单"
          aria-expanded={menu}
          data-testid="btn-menu"
        >
          <Menu size={17} />
          {unread > 0 && (
            <b className="dot-badge">{unread > 9 ? '9+' : unread}</b>
          )}
        </button>
      </div>
      {menu && (
        <nav className="menu-pop" aria-label="菜单">
          <button onClick={() => open('messages')} data-testid="btn-messages">
            消息 {unread > 0 && <small>{unread}</small>}
          </button>
          <button
            onClick={() => open('leaderboard')}
            data-testid="menu-leaderboard"
          >
            园区风云榜
          </button>
          <button onClick={() => open('market')} data-testid="btn-open-market">
            所有同事
          </button>
          <button onClick={() => open('guide')} data-testid="btn-guide">
            怎么玩
          </button>
          <button onClick={() => { setMenu(false); replayIntro(); }} data-testid="btn-replay-intro">
            重播电影片头
          </button>
          <button onClick={() => void logout()} data-testid="btn-switch">
            切换体验身份
          </button>
        </nav>
      )}
    </section>
  );
}

// ───────────────────── 底部中：当前可互动对象 ─────────────────────

function ColleagueCard({ c }: { c: ColleagueView }) {
  const snap = useGame((s) => s.snapshot)!;
  const [confirm, setConfirm] = useState(false);
  const reason = blockReason(c, snap);
  const owner = snap.players.find((p) => p.id === c.ownerId);
  const go = () => !reason && setConfirm(true);
  useEffect(() => {
    const on = () => go();
    window.addEventListener('world-interact', on);
    return () => window.removeEventListener('world-interact', on);
  });
  return (
    <div className="icard" data-testid="interact-card" data-target={c.id}>
      <Avatar look={dressedColleague(c, snap.players.find(p=>p.id===c.ownerId)?.style)} size={52} ring={owner?.color} />
      <div className="ic-main">
        <b>{displayName(c, snap)}</b>
        <span>
          {skillShort(c)} · {owner ? `${owner.name}的队员` : '自由身'}
        </span>
      </div>
      <button
        className={`btn ${owner ? 'poach' : 'primary'} ic-act`}
        disabled={!!reason}
        onClick={go}
        data-testid="ic-primary"
      >
        {reason ?? (
          <>
            {owner ? '挖角' : '招募'} <i className="coin sm" />
            {fmt(c.price)} <kbd>E</kbd>
          </>
        )}
      </button>
      {confirm && (
        <ConfirmTrade colleague={c} onClose={() => setConfirm(false)} />
      )}
    </div>
  );
}

function PlayerCard({ id }: { id: string }) {
  const snap = useGame((s) => s.snapshot)!;
  const toast = useGame((s) => s.toast);
  const refresh = useGame((s) => s.refresh);
  const cooldown = useWorld((s) => s.highfiveCooldown[id] ?? 0);
  const [, tick] = useState(0);
  const [showTeam, setShowTeam] = useState(false);
  const [confirm, setConfirm] = useState<ColleagueView | null>(null);
  const [busy, setBusy] = useState(false);
  const p = snap.players.find((x) => x.id === id);
  const av = snap.colleagues.find((c) => c.id === p?.avatarColleagueId);
  const team = snap.colleagues.filter((c) => c.ownerId === id);
  const left = Math.max(0, Math.ceil((cooldown - worldNow()) / 1000));
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => tick((x) => x + 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const cheers = async () => {
    if (busy || left > 0) return;
    setBusy(true);
    try {
      const r = await api.highfive(id);
      useWorld.setState((s) => ({
        highfiveCooldown: { ...s.highfiveCooldown, [id]: r.cooldownUntil },
      }));
      void refresh();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      const msg =
        code === 'TOO_SOON'
          ? '刚碰过杯，等会儿再来'
          : code === 'TOO_FAR'
            ? '再走近一点'
            : code === 'OFFLINE'
              ? '对方已离线'
              : e instanceof Error
                ? e.message
                : '碰杯失败';
      toast({ tone: 'info', title: `🥂 ${msg}` });
      if (code === 'TOO_SOON')
        useWorld.setState((s) => ({
          highfiveCooldown: {
            ...s.highfiveCooldown,
            [id]: worldNow() + 20_000,
          },
        }));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const on = () => void cheers();
    window.addEventListener('world-interact', on);
    return () => window.removeEventListener('world-interact', on);
  });

  if (!p) return null;
  return (
    <div className="icard player" data-testid="interact-card" data-target={id}>
      {av && <Avatar look={dressed(av.look, p.style)} size={52} ring={p.color} />}
      <div className="ic-main">
        <b>
          {p.name} <i className="tag-player">玩家</i>
        </b>
        <span>
          💰{fmt(p.coins)} · 队员 {team.length}/{MAX_TEAM}
        </span>
      </div>
      <div className="ic-acts">
        <button
          className="btn ghost"
          onClick={() =>
            void api.social({ emote: 'wave' }).catch(() => undefined)
          }
          data-testid="ic-wave"
        >
          👋
        </button>
        <button
          className="btn primary"
          disabled={busy || left > 0}
          onClick={() => void cheers()}
          data-testid="ic-highfive"
        >
          {left > 0 ? (
            `🥂 ${left}s`
          ) : (
            <>
              🥂 碰杯 +15 <kbd>E</kbd>
            </>
          )}
        </button>
        {team.length > 0 && (
          <button
            className="btn ghost"
            onClick={() => setShowTeam((v) => !v)}
            aria-expanded={showTeam}
            data-testid="ic-team"
          >
            队伍
          </button>
        )}
      </div>
      {showTeam && (
        <ul className="ic-team">
          {team.map((c) => {
            const reason = blockReason(c, snap);
            return (
              <li key={c.id}>
                <Avatar look={dressedColleague(c, snap.players.find(p=>p.id===c.ownerId)?.style)} size={30} />
                <span>
                  {c.name} {skillShort(c)}
                </span>
                <button
                  className="btn poach sm"
                  disabled={!!reason}
                  onClick={() => setConfirm(c)}
                >
                  {reason ?? `挖 ${fmt(c.price)}`}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {confirm && (
        <ConfirmTrade colleague={confirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

function TerminalCard() {
  const setProjectOpen = useWorld((s) => s.setProjectOpen);
  const sk = useGame((s) => s.snapshot!.projectSkills);
  useEffect(() => {
    const on = () => setProjectOpen(true);
    window.addEventListener('world-interact', on);
    return () => window.removeEventListener('world-interact', on);
  }, [setProjectOpen]);
  return (
    <div className="icard" data-testid="interact-card" data-target="terminal">
      <div className="ic-icon">
        <Gamepad2 size={28} />
      </div>
      <div className="ic-main">
        <b>老板来接招</b>
        <span>
          {projectDuration(sk) / 1000} 秒 · 收益 +{sk.incomePct}%
        </span>
      </div>
      <button
        className="btn primary ic-act"
        onClick={() => setProjectOpen(true)}
      >
        玩一局 <kbd>E</kbd>
      </button>
    </div>
  );
}

function Interact() {
  const near = useWorld((s) => s.near);
  const snap = useGame((s) => s.snapshot)!;
  const projectOpen = useWorld((s) => s.projectOpen);
  if (projectOpen) return null;
  if (!near) return <Hint />;
  return (
    <div className="interact-slot">{renderNear(near, snap.colleagues)}</div>
  );
}

function renderNear(near: Near, colleagues: ColleagueView[]) {
  if (near.kind === 'colleague') {
    const c = colleagues.find((x) => x.id === near.id);
    return c ? <ColleagueCard key={c.id} c={c} /> : null;
  }
  if (near.kind === 'player') return <PlayerCard key={near.id} id={near.id} />;
  return <TerminalCard />;
}

function Hint() {
  const snap = useGame((s) => s.snapshot)!;
  const team = myTeam(snap).length;
  const text = useMemo(() => {
    if (team === 0)
      return isTouch
        ? '左下摇杆走动 · 找老板加入小队'
        : 'W A S D 自由走动 · 点击地面也能走';
    if (snap.me.coins < 300) return '玩一局，再攒一点快乐基金';
    return '带着老板散散步，遇见同事就打个招呼';
  }, [team, snap.me.coins]);
  return (
    <div className="hint" data-testid="hint">
      {text}
    </div>
  );
}

// ───────────────────── 底部左：聊天与表情 ─────────────────────

const EMOTES: { k: EmoteKind; icon: string; label: string }[] = [
  { k: 'wave', icon: '👋', label: '挥手' },
  { k: 'dance', icon: '💃', label: '跳舞' },
  { k: 'coffee', icon: '☕', label: '举杯' },
];

function ChatBar() {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [cool, setCool] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useGame((s) => s.toast);
  useEffect(() => {
    const on = () => {
      setOpen(true);
      setTimeout(() => input.current?.focus(), 0);
    };
    window.addEventListener('world-chat', on);
    return () => window.removeEventListener('world-chat', on);
  }, []);
  const send = async (payload: { emote?: EmoteKind; text?: string }) => {
    if (cool) return;
    setCool(true);
    setTimeout(() => setCool(false), 1000);
    try {
      await api.social(payload);
    } catch (e) {
      toast({
        tone: 'info',
        title: e instanceof ApiError ? e.message : '发送失败',
      });
    }
  };
  const submit = () => {
    const t = clipCodepoints(text.trim(), 40);
    if (!t) {
      input.current?.blur();
      return;
    }
    setText('');
    void send({ text: t });
    input.current?.blur();
  };
  return (
    <div className="chatbar" data-testid="chatbar">
      {EMOTES.map((e) => (
        <button
          key={e.k}
          className="emote-btn"
          disabled={cool}
          onClick={() => void send({ emote: e.k })}
          title={e.label}
          aria-label={e.label}
          data-testid={`emote-${e.k}`}
        >
          {e.k === 'coffee' ? <Coffee size={18} /> : e.icon}
        </button>
      ))}
      {open ? (
        <form
          className="chat-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            submit();
          }}
        >
          <input
            ref={input}
            value={text}
            maxLength={80}
            onChange={(e) => setText(clipCodepoints(e.target.value, 40))}
            onFocus={() => useWorld.getState().lock('chat')}
            onBlur={() => useWorld.getState().unlock('chat')}
            onKeyDown={(e) => e.key === 'Escape' && input.current?.blur()}
            placeholder={isTouch ? '说点什么' : '说点什么（Enter）'}
            aria-label="发送一句话"
            data-testid="chat-input"
          />
        </form>
      ) : (
        <button
          className="emote-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('world-chat'))}
          aria-label="聊天"
        >
          <MessageCircle size={18} />
        </button>
      )}
    </div>
  );
}

// ───────────────────── 其它 ─────────────────────

function GameDock() {
  const setProjectOpen = useWorld((s) => s.setProjectOpen);
  const pending = useGame((s) => s.snapshot?.activeRun);
  const setDrawer = useGame((s) => s.setDrawer);
  const drawer = useGame((s) => s.drawer);
  return (
    <nav className="game-dock" aria-label="游戏主要操作">
      <button
        className="dock-play"
        onClick={() => setProjectOpen(true)}
        data-testid="btn-project"
      >
        <Gamepad2 size={23} />
        <span>{pending ? '继续玩' : '玩一局'}</span>
        <small>老板来接招</small>
      </button>
      <i className="dock-divider" />
      <button
        className={drawer === 'squad' ? 'active' : ''}
        onClick={() => setDrawer('squad')}
        data-testid="btn-squad"
      >
        <Crown size={21} />
        <span>我的小队</span>
      </button>
      <button
        className={drawer === 'shop' ? 'active' : ''}
        onClick={() => setDrawer('shop')}
        data-testid="btn-shop"
      >
        <ShoppingBag size={21} />
        <span>年终好物</span>
      </button>
      <button
        className={drawer === 'friends' ? 'active' : ''}
        onClick={() => setDrawer('friends')}
        data-testid="btn-friends"
      >
        <Users size={21} />
        <span>找搭子</span>
      </button>
    </nav>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.slice(-3).map((t) => (
        <div
          key={t.id}
          className={`toast ${t.tone}`}
          onClick={() => dismiss(t.id)}
          role="status"
        >
          {t.title}
        </div>
      ))}
    </div>
  );
}

function ConnBanner() {
  const conn = useGame((s) => s.conn);
  if (conn !== 'offline') return null;
  return (
    <div className="conn-banner" role="alert">
      连接中断，正在重连…
    </div>
  );
}

export function GameHud() {
  const online = useWorld((s) => s.players.length);
  const setDrawer = useGame((s) => s.setDrawer);
  const playing = useGame((s) => s.introPlaying);
  const shot = useCinema((s) => s.shot);
  const cinematic = playing || !!shot;
  return (
    <div className={`hud v3-hud ${cinematic ? 'cinematic' : ''}`}>
      <div className="game-interface" inert={cinematic} aria-hidden={cinematic}>
      <div className="v3-brand">
        今天老板给我打工 <span>A LITTLE BREAK, A LOT OF FUN</span>
      </div>
      <div className="v3-top">
        <WalletCard />
        <button className="online-chip" onClick={() => setDrawer('friends')}>
          <i />
          {online > 1 ? `${online} 位同事在园区` : '园区等你来热闹'}
        </button>
        <YearCard />
      </div>
      <QuickSquad />
      <MapPanel />
      <Toasts />
      <ConnBanner />
      <div className="hud-bottom">
        {isTouch ? <Joystick /> : null}
        <ChatBar />
        <Interact />
        <GameDock />
      </div>
      <ProjectGame />
      <Drawers />
      <Progression />
      </div>
      <CinematicOverlay />
    </div>
  );
}
