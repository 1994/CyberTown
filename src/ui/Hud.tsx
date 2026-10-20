import { useEffect, useRef, useState } from 'react';
import { MAX_TEAM, SKILL_META, projectDuration } from '../../shared/rules.ts';
import { myTeam, useGame } from '../store.ts';
import { Avatar } from './Avatar.tsx';
import { Market } from './Market.tsx';
import { ProjectGame } from './ProjectGame.tsx';
import { Drawers } from './Drawers.tsx';

export const fmt = (n: number) => n.toLocaleString('zh-CN');

/** 金币数字滚动 */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    setFlash(value > from ? 'up' : 'down');
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 700);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const id = setTimeout(() => setFlash(null), 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(id);
    };
  }, [value]);
  return <span className={`countup ${flash ?? ''}`}>{fmt(shown)}</span>;
}

function PlayerCard() {
  const snap = useGame((s) => s.snapshot)!;
  const conn = useGame((s) => s.conn);
  const lastSyncAt = useGame((s) => s.lastSyncAt);
  const me = snap.me;
  const avatar = snap.colleagues.find((c) => c.id === me.avatarColleagueId);
  const rank = snap.players.findIndex((p) => p.id === me.id) + 1;
  return (
    <section className="panel player-card" aria-label="我的信息">
      {avatar && <Avatar look={avatar.look} size={52} ring={me.color} />}
      <div className="pc-main">
        <div className="pc-name">
          {me.name}
          <span className="pill test" title="演示用测试身份，非真实 SSO 登录">测试身份</span>
        </div>
        <div className="coins" data-testid="my-coins" data-value={me.coins}>
          <i className="coin" aria-hidden="true" />
          <CountUp value={me.coins} />
          <small>金币</small>
        </div>
        <div className="pc-sub">
          团队资产 <b>{fmt(me.assets)}</b> · 排名 <b>#{rank}</b>
        </div>
      </div>
      <div className={`sync ${conn}`} title={`最近同步：${new Date(lastSyncAt).toLocaleTimeString('zh-CN')}`}>
        <i />
        {conn === 'live' ? '实时同步' : conn === 'connecting' ? '连接中' : '重连中'}
      </div>
    </section>
  );
}

function MiniBoard() {
  const snap = useGame((s) => s.snapshot)!;
  const setDrawer = useGame((s) => s.setDrawer);
  return (
    <section className="panel mini-board" aria-label="团队资产排行榜">
      <header>
        <span>🏆 团队资产榜</span>
        <button className="link" onClick={() => setDrawer('leaderboard')}>
          全部
        </button>
      </header>
      <ol>
        {snap.players.slice(0, 4).map((p, i) => (
          <li key={p.id} className={p.id === snap.me.id ? 'me' : ''} data-testid={`board-${p.id}`}>
            <span className="rank">{['🥇', '🥈', '🥉', '4'][i] ?? i + 1}</span>
            <span className={`dot ${p.online ? 'on' : ''}`} title={p.online ? '在线' : '离线'} />
            <span className="nm" style={{ color: p.color }}>
              {p.name}
            </span>
            <span className="val">{fmt(p.assets)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TopButtons() {
  const unread = useGame((s) => s.snapshot?.unread ?? 0);
  const setDrawer = useGame((s) => s.setDrawer);
  const replayIntro = useGame((s) => s.replayIntro);
  const logout = useGame((s) => s.logout);
  return (
    <nav className="top-buttons" aria-label="主菜单">
      <button className="icon-btn" onClick={() => setDrawer('guide')} data-testid="btn-guide">
        <span>📖</span>
        <em>指南</em>
      </button>
      <button className="icon-btn" onClick={() => setDrawer('leaderboard')}>
        <span>🏆</span>
        <em>排行</em>
      </button>
      <button className="icon-btn" onClick={() => setDrawer('messages')} data-testid="btn-messages" aria-label={`消息中心，${unread} 条未读`}>
        <span>🔔</span>
        <em>消息</em>
        {unread > 0 && <b className="badge">{unread > 99 ? '99+' : unread}</b>}
      </button>
      <button className="icon-btn" onClick={replayIntro} data-testid="btn-replay-intro">
        <span>🎬</span>
        <em>片头</em>
      </button>
      <button className="icon-btn" onClick={() => void logout()} data-testid="btn-switch">
        <span>🔄</span>
        <em>切换身份</em>
      </button>
    </nav>
  );
}

function TeamDock() {
  const snap = useGame((s) => s.snapshot)!;
  const team = myTeam(snap);
  const sk = snap.teamSkills;
  const slots = Array.from({ length: MAX_TEAM }, (_, i) => team.find((c) => c.deskSlot === i) ?? null);
  return (
    <section className="panel team-dock" aria-label="我的团队">
      <header>
        <span>
          👥 我的团队 <b>{team.length}</b>/{MAX_TEAM}
        </span>
      </header>
      <div className="slots">
        {slots.map((c, i) =>
          c ? (
            <div key={i} className="slot filled" data-testid={`team-slot-${i}`} title={`${c.name} · ${SKILL_META[c.skill.kind].describe(c.skill.value)}`}>
              <Avatar look={c.look} size={40} />
              <div>
                <b>{c.name}</b>
                <span className="skill-chip" style={{ ['--c' as string]: SKILL_META[c.skill.kind].color }}>
                  {SKILL_META[c.skill.kind].icon} {SKILL_META[c.skill.kind].describe(c.skill.value)}
                </span>
              </div>
            </div>
          ) : (
            <div key={i} className="slot empty" data-testid={`team-slot-${i}`}>
              <span>＋</span>
              <em>空工位 {i + 1}</em>
            </div>
          ),
        )}
      </div>
      <div className="effects" aria-label="团队技能生效数值">
        <span title="项目收益加成（向下取整）">💰 收益 +{sk.incomePct}%</span>
        <span title="项目时长">⏱️ {projectDuration(sk) / 1000} 秒</span>
        <span title="失误不断连击的次数">🛡️ 护盾 ×{sk.shield}</span>
      </div>
    </section>
  );
}

function NextStep() {
  const snap = useGame((s) => s.snapshot)!;
  const team = myTeam(snap);
  const free = snap.colleagues.filter((c) => !c.ownerId && c.selfPlayerId !== snap.me.id);
  let text: string;
  if (team.length === 0 && snap.me.coins >= 300) text = '第 1 步：在右侧「人才市场」签下第一位同事（300 金币）';
  else if (snap.me.coins < 300 && team.length < MAX_TEAM) text = '金币不够了？接一个「紧急项目」赚钱吧';
  else if (team.length < MAX_TEAM && free.length) text = `继续招募：还有 ${MAX_TEAM - team.length} 个空工位`;
  else if (team.length < MAX_TEAM) text = '自由同事都被签走了，去挖别人的王牌吧！';
  else text = '团队已满 3 人：接项目刷收益，冲击排行榜第一！';
  return (
    <div className="next-step" role="status" data-testid="next-step">
      <b>下一步</b>
      {text}
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)} role="status">
          <b>{t.title}</b>
          {t.body && <span>{t.body}</span>}
        </div>
      ))}
    </div>
  );
}

function IntroOverlay() {
  const playing = useGame((s) => s.introPlaying);
  const setIntroPlaying = useGame((s) => s.setIntroPlaying);
  const nonce = useGame((s) => s.introNonce);
  if (!playing) return null;
  return (
    <div className="intro" key={nonce} data-testid="intro-overlay">
      <div className="bar top" />
      <div className="bar bottom" />
      <div className="intro-title">
        <small>第 1 天 · 晚上 8:00 · 全员加班中</small>
        <h1>
          今天<span>老板</span>给我打工
        </h1>
      </div>
      <button className="btn ghost skip" onClick={() => setIntroPlaying(false)} data-testid="btn-skip-intro">
        跳过片头 ▶▶
      </button>
    </div>
  );
}

function ConnBanner() {
  const conn = useGame((s) => s.conn);
  if (conn !== 'offline') return null;
  return (
    <div className="conn-banner" role="alert">
      ⚠️ 实时连接中断，正在自动重连…（期间每 4 秒轮询同步）
    </div>
  );
}

export function Hud() {
  const marketOpen = useGame((s) => s.marketOpen);
  const setMarketOpen = useGame((s) => s.setMarketOpen);
  const introPlaying = useGame((s) => s.introPlaying);
  const setDrawer = useGame((s) => s.setDrawer);
  const meId = useGame((s) => s.snapshot!.me.id);

  // 首次进入：片头结束后自动打开新手指引（仅记录「是否看过」的界面偏好）
  useEffect(() => {
    if (introPlaying) return;
    const k = `boss.guideSeen.${meId}`;
    if (!localStorage.getItem(k)) {
      localStorage.setItem(k, '1');
      setDrawer('guide');
    }
  }, [introPlaying, meId, setDrawer]);

  return (
    <div className={`hud ${introPlaying ? 'cinematic' : ''}`}>
      <div className="hud-left">
        <PlayerCard />
        <MiniBoard />
      </div>
      <TopButtons />
      <Toasts />
      <ConnBanner />
      <div className="hud-bottom">
        <TeamDock />
        <div className="center-actions">
          <NextStep />
          <ProjectGame />
        </div>
      </div>
      <button className={`market-fab ${marketOpen ? 'hide' : ''}`} onClick={() => setMarketOpen(true)} data-testid="btn-open-market">
        🧑‍💼 人才市场
      </button>
      {marketOpen && <Market onClose={() => setMarketOpen(false)} />}
      <Drawers />
      <IntroOverlay />
    </div>
  );
}
