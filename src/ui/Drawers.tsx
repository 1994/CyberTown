import { useEffect, useState } from 'react';
import type { ColleagueView } from '../../shared/types.ts';
import { useGame } from '../store.ts';
import { api } from '../api.ts';
import { fmt } from './common.tsx';
import { Avatar } from './Avatar.tsx';
import { ConfirmTrade, blockReason, displayName, skillShort } from './Confirm.tsx';
import { walkNear } from '../scene/Avatars.tsx';
import { rt } from '../world/runtime.ts';

// 二级层：消息、排行、名册、规则。默认不打开，不自动弹出。

const KIND_ICON: Record<string, string> = {
  sign: '✍️',
  poach: '🎯',
  poached: '😱',
  dividend: '🎉',
  project: '💰',
  market: '📣',
  system: '🏢',
};

function timeAgo(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}秒前`;
  if (s < 3600) return `${Math.floor(s / 60)}分钟前`;
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function Messages() {
  const snap = useGame((s) => s.snapshot)!;
  const refresh = useGame((s) => s.refresh);
  useEffect(() => {
    if (snap.unread > 0) void api.markRead().then(() => refresh());
  }, [snap.unread, refresh]);
  return (
    <div className="drawer-body" data-testid="messages">
      {snap.messages.length === 0 && <p className="muted">暂无消息</p>}
      <ul className="msg-list">
        {snap.messages.map((m) => (
          <li key={m.id} className={`msg ${m.scope} ${m.read ? '' : 'unread'} k-${m.kind}`}>
            <span className="mi">{KIND_ICON[m.kind] ?? '•'}</span>
            <div>
              <b>{m.title}</b>
              <p>{m.body}</p>
              <small>
                {m.scope === 'global' ? '全服 · ' : ''}
                {timeAgo(m.createdAt)}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Leaderboard() {
  const snap = useGame((s) => s.snapshot)!;
  return (
    <div className="drawer-body" data-testid="leaderboard">
      <ol className="board">
        {snap.players.map((p, i) => {
          const av = snap.colleagues.find((c) => c.id === p.avatarColleagueId);
          const team = snap.colleagues.filter((c) => c.ownerId === p.id);
          return (
            <li key={p.id} className={p.id === snap.me.id ? 'me' : ''} data-testid={`board-${p.id}`}>
              <span className="rank">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
              {av && <Avatar look={av.look} size={42} ring={p.color} />}
              <div className="b-main">
                <b>
                  {p.name} <span className={`dot ${p.online ? 'on' : ''}`} />
                </b>
                <small>👥 {team.map((c) => c.name).join('、') || '还没有队员'}</small>
              </div>
              <div className="b-val">
                {fmt(p.assets)}
                <small>💰{fmt(p.coins)}</small>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="fine">资产 = 金币 + 队员身价</p>
    </div>
  );
}

/** 名册：所有同事的简表；可直接招募，或「带我去」走到对方身边 */
function Roster() {
  const snap = useGame((s) => s.snapshot)!;
  const setDrawer = useGame((s) => s.setDrawer);
  const [confirm, setConfirm] = useState<ColleagueView | null>(null);
  return (
    <div className="drawer-body" data-testid="market">
      <ul className="roster">
        {snap.colleagues.map((c) => {
          const reason = blockReason(c, snap);
          const owner = snap.players.find((p) => p.id === c.ownerId);
          return (
            <li key={c.id} className={c.ownerId === snap.me.id ? 'mine' : ''} data-testid={`mcard-${c.id}`}>
              <Avatar look={c.look} size={40} ring={owner?.color} />
              <div className="r-main">
                <b>{displayName(c, snap)}</b>
                <small>
                  {skillShort(c)} · {owner ? `属于${owner.name}` : '自由身'}
                </small>
              </div>
              <button
                className="btn ghost sm"
                onClick={() => {
                  const p = rt.colleaguePos.get(c.id);
                  if (p) walkNear(p.x, p.z, 1.5);
                  setDrawer(null);
                }}
              >
                带我去
              </button>
              <button className={`btn sm ${c.ownerId ? 'poach' : 'primary'}`} disabled={!!reason} onClick={() => setConfirm(c)} data-testid={`sign-${c.id}`}>
                {reason ?? `${c.ownerId ? '挖' : '招'} ${fmt(c.price)}`}
              </button>
            </li>
          );
        })}
      </ul>
      {confirm && <ConfirmTrade colleague={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function Rules() {
  return (
    <div className="drawer-body guide" data-testid="guide">
      <ul className="rules">
        <li>🚶 WASD/方向键走动，点地面自动走，手机用左下摇杆。拖拽旋转镜头，滚轮缩放，M 看全图。</li>
        <li>🧑‍💼 人才街的同事走近按 E 招募；别人队里的同事也能挖，价格每次涨约 25%。</li>
        <li>🥂 走到在线玩家身边碰杯，双方各 +15（每人每分钟一次）。</li>
        <li>🚨 「接项目」15 秒：目标进入光圈时按空格/点击处理，避开 🥧。</li>
        <li>💰 队员技能：收益 +%、项目时长 +秒、失误护盾。最多 3 人。</li>
        <li>🎉 你的分身被别人招募/挖走，你拿成交价 5%；被挖走的队员原老板拿 90%。</li>
      </ul>
      <p className="fine">所有金币为整数，分成向下取整，余数归系统。登录为测试身份，未接入真实 SSO。</p>
    </div>
  );
}

export function Drawers() {
  const drawer = useGame((s) => s.drawer);
  const setDrawer = useGame((s) => s.setDrawer);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, setDrawer]);
  if (!drawer) return null;
  const title = { messages: '消息', leaderboard: '排行榜', guide: '玩法', market: '同事名册' }[drawer];
  return (
    <div className="drawer-backdrop" onClick={() => setDrawer(null)}>
      <aside className="panel drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button className="icon-close" onClick={() => setDrawer(null)} aria-label="关闭" autoFocus data-testid="drawer-close">
            ✕
          </button>
        </header>
        {drawer === 'messages' && <Messages />}
        {drawer === 'leaderboard' && <Leaderboard />}
        {drawer === 'market' && <Roster />}
        {drawer === 'guide' && <Rules />}
      </aside>
    </div>
  );
}
