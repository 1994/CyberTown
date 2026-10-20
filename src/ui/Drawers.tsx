import { useEffect } from 'react';
import { useGame } from '../store.ts';
import { api } from '../api.ts';
import { fmt } from './Hud.tsx';
import { Avatar } from './Avatar.tsx';

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
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
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
                {m.scope === 'global' ? '全服动态 · ' : ''}
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
      <p className="muted">团队资产 = 金币 + 队员身价（各队员最近成交价）。实时更新。</p>
      <ol className="board">
        {snap.players.map((p, i) => {
          const av = snap.colleagues.find((c) => c.id === p.avatarColleagueId);
          const team = snap.colleagues.filter((c) => c.ownerId === p.id);
          return (
            <li key={p.id} className={p.id === snap.me.id ? 'me' : ''}>
              <span className="rank">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
              {av && <Avatar look={av.look} size={42} ring={p.color} />}
              <div className="b-main">
                <b>
                  {p.name} <span className={`dot ${p.online ? 'on' : ''}`} /> {p.id === snap.me.id && <span className="pill">你</span>}
                </b>
                <small>
                  💰 {fmt(p.coins)} · 👥 {team.map((c) => c.name).join('、') || '暂无队员'}
                </small>
              </div>
              <div className="b-val">
                {fmt(p.assets)}
                <small>队员身价 {fmt(p.teamValue)}</small>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="fine">系统回收池累计：{fmt(snap.systemPool)} 金币（初签入职费、5% 回收与取整零头）。</p>
    </div>
  );
}

function Guide() {
  const replayIntro = useGame((s) => s.replayIntro);
  const setDrawer = useGame((s) => s.setDrawer);
  return (
    <div className="drawer-body guide" data-testid="guide">
      <h4>🎯 新手指引（约 3 分钟一轮）</h4>
      <ol className="steps">
        <li>
          <b>赚钱</b>：点底部「🚨 接紧急项目」，15 秒内点击任务卡，连击越高赚得越多；结束后服务器结算到账。
        </li>
        <li>
          <b>招募</b>：右侧「人才市场」签下自由身同事（初签 300）。新同事会从<em>电梯</em>走到工位坐下，技能立即生效。
        </li>
        <li>
          <b>技能</b>：💰 业绩光环提高项目收益；⏱️ 时间管理延长项目时长；🛡️ 甩锅护盾让失误不断连击。底部团队栏显示合计生效数值。
        </li>
        <li>
          <b>挖角</b>：别人团队里的同事也能直接挖！价格 = ⌈前价×1.25/10⌉×10。被挖走的同事会起身收拾纸箱、坐电梯离开，原老板获得 90% 补偿。
        </li>
        <li>
          <b>分身分红</b>：每位测试玩家在市场里都有「分身」。你的分身每被交易一次，你都能拿到成交价的 5%。
        </li>
      </ol>
      <h4>👥 双人演示操作指南（每步余额都够）</h4>
      <ol className="steps">
        <li>窗口 A（普通窗口）选择「老王」，窗口 B（无痕窗口或另一浏览器）选择「小李」。两人各 600 金币。</li>
        <li>A：签约「张总」（初签 300，A 剩 300）。B 的排行榜、消息与市场在 3 秒内同步显示张总归属老王。</li>
        <li>
          B：挖角「张总」（380，B 剩 220）→ A 的办公室里张总起身、收拾纸箱、坐电梯离开，空工位显示「补偿 +342」（A 变 642）；B 的办公室里张总从电梯走进来坐下并激活技能。
        </li>
        <li>B：接一次 15 秒「紧急项目」，至少赚 80 金币（带张总 +25% 收益，正常完成约 150～400）。</li>
        <li>B：余额 ≥300 后签约「老王(分身)」→ A 立即收到 5% 分红 +15（A 变 657）。</li>
        <li>A：用 657 金币把张总挖回来（480）……循环！</li>
      </ol>
      <h4>📐 规则速查（整数金币）</h4>
      <ul className="rules">
        <li>新玩家 600 金币；最多 3 名生效队员；不能签约自己已持有的同事或自己的分身。</li>
        <li>挖角：原持有人 ⌊价×90%⌋，分身本人 ⌊价×5%⌋，其余（≥5% + 取整零头）系统回收。</li>
        <li>初签：没有原持有人，分身本人 5%，其余 95% 作为入职费由系统回收。</li>
        <li>并发抢购只有一人成功，其余会提示「手慢了」并刷新价格。</li>
      </ul>
      <div className="modal-actions">
        <button
          className="btn ghost"
          onClick={() => {
            setDrawer(null);
            replayIntro();
          }}
        >
          🎬 重播入场片头
        </button>
        <button className="btn primary" onClick={() => setDrawer(null)} data-testid="guide-close">
          开始打工！
        </button>
      </div>
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
  const title = { messages: '🔔 消息中心', leaderboard: '🏆 团队资产排行榜', guide: '📖 新手指引 & 演示指南' }[drawer];
  return (
    <div className="drawer-backdrop" onClick={() => setDrawer(null)}>
      <aside className="panel drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button className="icon-close" onClick={() => setDrawer(null)} aria-label="关闭" autoFocus>
            ✕
          </button>
        </header>
        {drawer === 'messages' && <Messages />}
        {drawer === 'leaderboard' && <Leaderboard />}
        {drawer === 'guide' && <Guide />}
      </aside>
    </div>
  );
}
