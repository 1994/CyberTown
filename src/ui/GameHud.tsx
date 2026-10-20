import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColleagueView, EmoteKind } from '../../shared/types.ts';
import { MAX_TEAM, SKILL_META, projectDuration } from '../../shared/rules.ts';
import { zoneAt } from '../../shared/world.ts';
import { api, ApiError } from '../api.ts';
import { myTeam, useGame } from '../store.ts';
import { rt, useWorld, worldNow } from '../world/runtime.ts';
import type { Near } from '../world/runtime.ts';
import { Avatar } from './Avatar.tsx';
import { CountUp, clipCodepoints, fmt } from './common.tsx';
import { ConfirmTrade, blockReason, displayName, skillShort } from './Confirm.tsx';
import { Minimap } from './Minimap.tsx';
import { Joystick } from './Joystick.tsx';
import { Drawers } from './Drawers.tsx';
import { ProjectGame } from './ProjectGame.tsx';

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

// ───────────────────── 左上：我 + 小队 ─────────────────────

function MeChip() {
  const snap = useGame((s) => s.snapshot)!;
  const conn = useGame((s) => s.conn);
  const me = snap.me;
  const avatar = snap.colleagues.find((c) => c.id === me.avatarColleagueId);
  const team = myTeam(snap);
  const sk = snap.teamSkills;
  return (
    <section className="me-chip" aria-label="我的状态">
      <div className="me-row">
        {avatar && <Avatar look={avatar.look} size={46} ring="#ffd166" />}
        <div className="me-main">
          <div className="me-name">
            {me.name}
            <span className="pill test" title="演示用测试身份，非真实 SSO">
              测试身份
            </span>
            <i className={`live ${conn}`} title={conn === 'live' ? '实时同步中' : '重连中'} />
          </div>
          <div className="coins" data-testid="my-coins" data-value={me.coins}>
            <i className="coin" aria-hidden="true" />
            <CountUp value={me.coins} />
          </div>
        </div>
      </div>
      <div className="squad" aria-label={`小队 ${team.length}/${MAX_TEAM}`}>
        {Array.from({ length: MAX_TEAM }, (_, i) => {
          const c = team.find((t) => t.deskSlot === i);
          return c ? (
            <div key={i} className="sq filled" title={`${c.name} · ${SKILL_META[c.skill.kind].describe(c.skill.value)}`} data-testid={`team-slot-${i}`}>
              <Avatar look={c.look} size={34} />
              <span className="sq-skill" style={{ background: SKILL_META[c.skill.kind].color }}>
                {SKILL_META[c.skill.kind].icon}
              </span>
            </div>
          ) : (
            <div key={i} className="sq empty" data-testid={`team-slot-${i}`} title="空位：去人才街招人">
              +
            </div>
          );
        })}
        <div className="sq-buffs" title="小队技能合计">
          {sk.incomePct > 0 && <span>💰+{sk.incomePct}%</span>}
          {sk.timeSec > 0 && <span>⏱+{sk.timeSec}s</span>}
          {sk.shield > 0 && <span>🛡×{sk.shield}</span>}
        </div>
      </div>
    </section>
  );
}

// ───────────────────── 右上：地图 + 菜单 ─────────────────────

function MapPanel() {
  const overview = useWorld((s) => s.overview);
  const setOverview = useWorld((s) => s.setOverview);
  const unread = useGame((s) => s.snapshot?.unread ?? 0);
  const [menu, setMenu] = useState(false);
  const setDrawer = useGame((s) => s.setDrawer);
  const replayIntro = useGame((s) => s.replayIntro);
  const logout = useGame((s) => s.logout);
  const [zone, setZone] = useState('');
  useEffect(() => {
    const id = setInterval(() => setZone(zoneAt(rt.me.x, rt.me.z)?.name ?? '园区'), 500);
    return () => clearInterval(id);
  }, []);
  const open = (d: Parameters<typeof setDrawer>[0]) => {
    setMenu(false);
    setDrawer(d);
  };
  return (
    <section className="map-panel">
      <Minimap />
      <div className="map-bar">
        <span className="zone-name" data-testid="zone-name">
          📍 {zone}
        </span>
        <button className={`chip-btn ${overview ? 'on' : ''}`} onClick={() => setOverview(!overview)} title="总览全图（M）" data-testid="btn-overview">
          {overview ? '回到我' : '全图'}
        </button>
        <button className="chip-btn" onClick={() => setMenu((v) => !v)} aria-expanded={menu} data-testid="btn-menu">
          ☰{unread > 0 && <b className="dot-badge">{unread > 9 ? '9+' : unread}</b>}
        </button>
      </div>
      {menu && (
        <nav className="menu-pop" aria-label="菜单">
          <button onClick={() => open('leaderboard')} data-testid="menu-leaderboard">
            🏆 排行榜
          </button>
          <button onClick={() => open('messages')} data-testid="btn-messages">
            🔔 消息{unread > 0 && <b className="dot-badge">{unread}</b>}
          </button>
          <button onClick={() => open('market')} data-testid="btn-open-market">
            📇 同事名册
          </button>
          <button onClick={() => open('guide')} data-testid="btn-guide">
            📖 玩法
          </button>
          <button
            onClick={() => {
              setMenu(false);
              replayIntro();
            }}
            data-testid="btn-replay-intro"
          >
            🎬 入场镜头
          </button>
          <button onClick={() => void logout()} data-testid="btn-switch">
            🔄 切换身份
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
      <Avatar look={c.look} size={52} ring={owner?.color} />
      <div className="ic-main">
        <b>{displayName(c, snap)}</b>
        <span>
          {skillShort(c)} · {owner ? `${owner.name}的队员` : '自由身'}
        </span>
      </div>
      <button className={`btn ${owner ? 'poach' : 'primary'} ic-act`} disabled={!!reason} onClick={go} data-testid="ic-primary">
        {reason ?? (
          <>
            {owner ? '挖角' : '招募'} <i className="coin sm" />
            {fmt(c.price)} <kbd>E</kbd>
          </>
        )}
      </button>
      {confirm && <ConfirmTrade colleague={c} onClose={() => setConfirm(false)} />}
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
      useWorld.setState((s) => ({ highfiveCooldown: { ...s.highfiveCooldown, [id]: r.cooldownUntil } }));
      void refresh();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      const msg = code === 'TOO_SOON' ? '刚碰过杯，等会儿再来' : code === 'TOO_FAR' ? '再走近一点' : code === 'OFFLINE' ? '对方已离线' : e instanceof Error ? e.message : '碰杯失败';
      toast({ tone: 'info', title: `🥂 ${msg}` });
      if (code === 'TOO_SOON') useWorld.setState((s) => ({ highfiveCooldown: { ...s.highfiveCooldown, [id]: worldNow() + 20_000 } }));
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
      {av && <Avatar look={av.look} size={52} ring={p.color} />}
      <div className="ic-main">
        <b>
          {p.name} <i className="tag-player">玩家</i>
        </b>
        <span>
          💰{fmt(p.coins)} · 队员 {team.length}/{MAX_TEAM}
        </span>
      </div>
      <div className="ic-acts">
        <button className="btn ghost" onClick={() => void api.social({ emote: 'wave' }).catch(() => undefined)} data-testid="ic-wave">
          👋
        </button>
        <button className="btn primary" disabled={busy || left > 0} onClick={() => void cheers()} data-testid="ic-highfive">
          {left > 0 ? `🥂 ${left}s` : (
            <>
              🥂 碰杯 +15 <kbd>E</kbd>
            </>
          )}
        </button>
        {team.length > 0 && (
          <button className="btn ghost" onClick={() => setShowTeam((v) => !v)} aria-expanded={showTeam} data-testid="ic-team">
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
                <Avatar look={c.look} size={30} />
                <span>
                  {c.name} {skillShort(c)}
                </span>
                <button className="btn poach sm" disabled={!!reason} onClick={() => setConfirm(c)}>
                  {reason ?? `挖 ${fmt(c.price)}`}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {confirm && <ConfirmTrade colleague={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function TerminalCard() {
  const setProjectOpen = useWorld((s) => s.setProjectOpen);
  const sk = useGame((s) => s.snapshot!.teamSkills);
  useEffect(() => {
    const on = () => setProjectOpen(true);
    window.addEventListener('world-interact', on);
    return () => window.removeEventListener('world-interact', on);
  }, [setProjectOpen]);
  return (
    <div className="icard" data-testid="interact-card" data-target="terminal">
      <div className="ic-icon">🚨</div>
      <div className="ic-main">
        <b>紧急项目终端</b>
        <span>{projectDuration(sk) / 1000} 秒 · 收益 +{sk.incomePct}%</span>
      </div>
      <button className="btn primary ic-act" onClick={() => setProjectOpen(true)}>
        开工 <kbd>E</kbd>
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
  return <div className="interact-slot">{renderNear(near, snap.colleagues)}</div>;
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
    if (team === 0) return isTouch ? '摇杆走动 · 去 🧑‍💼人才街 找人入伙' : 'WASD 走动 · 点地面寻路 · 去 🧑‍💼人才街 找人入伙';
    if (snap.me.coins < 300) return '⚡ 接个项目赚点钱';
    return '走到人身边：招人 / 碰杯';
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
  const [open, setOpen] = useState(!isTouch);
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
      toast({ tone: 'info', title: e instanceof ApiError ? e.message : '发送失败' });
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
        <button key={e.k} className="emote-btn" disabled={cool} onClick={() => void send({ emote: e.k })} title={e.label} aria-label={e.label} data-testid={`emote-${e.k}`}>
          {e.icon}
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
        <button className="emote-btn" onClick={() => window.dispatchEvent(new CustomEvent('world-chat'))} aria-label="聊天">
          💬
        </button>
      )}
    </div>
  );
}

// ───────────────────── 其它 ─────────────────────

function EarnButton() {
  const setProjectOpen = useWorld((s) => s.setProjectOpen);
  const pending = useGame((s) => s.snapshot?.activeRun);
  return (
    <button className="earn-btn" onClick={() => setProjectOpen(true)} data-testid="btn-project">
      <span>⚡</span>
      {pending ? '继续项目' : '接项目'}
    </button>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.slice(-3).map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)} role="status">
          {t.title}
        </div>
      ))}
    </div>
  );
}

function IntroSkip() {
  const playing = useGame((s) => s.introPlaying);
  if (!playing) return null;
  return (
    <button className="intro-skip" onClick={() => window.dispatchEvent(new CustomEvent('world-skip-intro'))} data-testid="btn-skip-intro">
      跳过 ▶▶
    </button>
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
  return (
    <div className="hud">
      <MeChip />
      <MapPanel />
      <Toasts />
      <ConnBanner />
      <IntroSkip />
      <div className="hud-bottom">
        {isTouch ? <Joystick /> : null}
        <ChatBar />
        <Interact />
        <EarnButton />
      </div>
      <ProjectGame />
      <Drawers />
    </div>
  );
}
