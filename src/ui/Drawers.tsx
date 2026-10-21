import { dressed, dressedColleague } from '../look.ts';
import { useEffect, useRef, useState } from 'react';
import type { ColleagueView } from '../../shared/types.ts';
import { useGame } from '../store.ts';
import { api } from '../api.ts';
import { fmt } from './common.tsx';
import { Avatar } from './Avatar.tsx';
import {
  ConfirmTrade,
  blockReason,
  displayName,
  skillShort,
} from './Confirm.tsx';
import { goToColleague } from '../world/navigation.ts';
import { Coins, Crown, Gamepad2, Move, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus.ts';

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
          <li
            key={m.id}
            className={`msg ${m.scope} ${m.read ? '' : 'unread'} k-${m.kind}`}
          >
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
            <li
              key={p.id}
              className={p.id === snap.me.id ? 'me' : ''}
              data-testid={`board-${p.id}`}
            >
              <span className="rank">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
              {av && <Avatar look={dressed(av.look, p.style)} size={42} ring={p.color} />}
              <div className="b-main">
                <b>
                  {p.name} <span className={`dot ${p.online ? 'on' : ''}`} />
                </b>
                <small>
                  👥 {team.map((c) => c.name).join('、') || '还没有队员'}
                </small>
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
  const [confirm, setConfirm] = useState<ColleagueView | null>(null);
  return (
    <div className="drawer-body" data-testid="market">
      <ul className="roster">
        {snap.colleagues.map((c) => {
          const reason = blockReason(c, snap);
          const owner = snap.players.find((p) => p.id === c.ownerId);
          return (
            <li
              key={c.id}
              className={c.ownerId === snap.me.id ? 'mine' : ''}
              data-testid={`mcard-${c.id}`}
            >
              <Avatar look={dressedColleague(c, snap.players.find(p=>p.id===c.ownerId)?.style)} size={40} ring={owner?.color} />
              <div className="r-main">
                <b>{displayName(c, snap)}</b>
                <small>
                  {skillShort(c)} · {owner ? `属于${owner.name}` : '自由身'}
                </small>
              </div>
              <button
                className="btn ghost sm"
                onClick={() => {
                  void goToColleague(c).catch(() => useGame.getState().toast({ tone: 'info', title: '对方暂时离开了，请稍后再试' }));
                }}
              >
                带我去
              </button>
              <button
                className={`btn sm ${c.ownerId ? 'poach' : 'primary'}`}
                disabled={!!reason}
                onClick={() => setConfirm(c)}
                data-testid={`sign-${c.id}`}
              >
                {reason ?? `${c.ownerId ? '挖' : '招'} ${fmt(c.price)}`}
              </button>
            </li>
          );
        })}
      </ul>
      {confirm && (
        <ConfirmTrade colleague={confirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

const STEPS: { Icon: LucideIcon; title: string; text: string }[] = [
  { Icon: Crown, title: '雇个老板', text: '走近人才街的同事招募，小队最多 3 人，技能帮你多赚。' },
  { Icon: Gamepad2, title: '玩一局，领年终奖', text: '15 秒接礼物、躲大饼。每年 3 局有命中，就发年终奖。' },
  { Icon: Users, title: '和同事一起逛', text: '走近在线同事挥手、碰杯，双方各 +15 金币。' },
];

function Rules() {
  return (
    <div className="drawer-body guide" data-testid="guide">
      <ol className="guide-steps">
        {STEPS.map(({ Icon, title, text }, i) => (
          <li key={title}>
            <span className="guide-step-icon"><Icon size={22} /></span>
            <div>
              <b><i>{i + 1}</i>{title}</b>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <details className="guide-more">
        <summary><Move size={17} />怎么操作</summary>
        <ul>
          <li>电脑：WASD 或方向键走路，点地面自动走；E 互动，P 打开手机，M 看全图。</li>
          <li>手机：左下摇杆走路，右下按钮互动；拖动画面转镜头。</li>
          <li>小游戏：礼物进圈时按空格或点「接住」，接到大饼会断连击。</li>
        </ul>
      </details>
      <details className="guide-more">
        <summary><Coins size={17} />成长与金币</summary>
        <ul>
          <li>每次接住 +10 成长值，成长值和有效局数都达标就能晋升，年终奖更高。</li>
          <li>别人队里的同事也能挖，每被挖一次身价约涨 25%。</li>
          <li>队员被挖走，原老板拿成交价 90%；你的分身被招募或挖走，你拿 5%。</li>
          <li>年终好物商店可以给自己或老板换装。</li>
        </ul>
      </details>
    </div>
  );
}

export function Drawers() {
  const drawer = useGame((s) => s.drawer);
  const setDrawer = useGame((s) => s.setDrawer);
  const dialog = useRef<HTMLElement>(null);
  const open = drawer === 'messages' || drawer === 'leaderboard' || drawer === 'guide' || drawer === 'market';
  useDialogFocus(dialog, open, 'button[aria-label="更多菜单"]');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (e.key === 'Escape' && dialogs.item(dialogs.length - 1) === dialog.current) {
        e.preventDefault();
        e.stopPropagation();
        setDrawer(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setDrawer]);
  if (!open) return null;
  const title = {
    messages: '消息',
    leaderboard: '排行榜',
    guide: '玩法',
    market: '同事名册',
  }[drawer];
  return (
    <div className="drawer-backdrop" onClick={() => setDrawer(null)}>
      <aside
        ref={dialog}
        tabIndex={-1}
        className="panel drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>{title}</h3>
          <button
            className="icon-close"
            onClick={() => setDrawer(null)}
            aria-label="关闭"
            data-testid="drawer-close"
          >
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
