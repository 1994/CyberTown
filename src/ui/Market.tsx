import { useEffect, useRef, useState } from 'react';
import { MAX_TEAM, SKILL_META, nextPrice, splitPayment } from '../../shared/rules.ts';
import type { ColleagueView } from '../../shared/types.ts';
import { myTeam, useGame } from '../store.ts';
import { api, ApiError } from '../api.ts';
import { Avatar } from './Avatar.tsx';
import { fmt } from './Hud.tsx';

type Filter = 'all' | 'free' | 'owned';

function blockReason(c: ColleagueView, meId: string, coins: number, teamSize: number): string | null {
  if (c.ownerId === meId) return '已在团队';
  if (c.selfPlayerId === meId) return '你的分身';
  if (teamSize >= MAX_TEAM) return '团队已满';
  if (coins < c.price) return '余额不足';
  return null;
}

export function Market({ onClose }: { onClose: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const [filter, setFilter] = useState<Filter>('all');
  const [confirm, setConfirm] = useState<ColleagueView | null>(null);
  const me = snap.me;
  const teamSize = myTeam(snap).length;
  const nameOf = (id: string | null) => snap.players.find((p) => p.id === id)?.name ?? '—';
  const list = snap.colleagues.filter((c) => (filter === 'free' ? !c.ownerId : filter === 'owned' ? !!c.ownerId : true));

  return (
    <aside className="panel market" aria-label="人才市场" data-testid="market">
      <header className="market-head">
        <div>
          <h2>🧑‍💼 人才市场</h2>
          <p className="muted">初签 300 · 再挖角价 = ⌈前价×1.25/10⌉×10</p>
        </div>
        <button className="icon-close" onClick={onClose} aria-label="收起人才市场">
          ✕
        </button>
      </header>
      <div className="tabs" role="tablist">
        {(
          [
            ['all', '全部'],
            ['free', '自由身'],
            ['owned', '可挖角'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      <ul className="market-list">
        {list.map((c) => {
          const reason = blockReason(c, me.id, me.coins, teamSize);
          const meta = SKILL_META[c.skill.kind];
          const isPoach = !!c.ownerId;
          return (
            <li key={c.id} className={`mcard ${c.ownerId === me.id ? 'mine' : ''}`} data-testid={`mcard-${c.id}`}>
              <Avatar look={c.look} size={54} ring={c.ownerId ? snap.players.find((p) => p.id === c.ownerId)?.color : undefined} />
              <div className="mc-body">
                <div className="mc-title">
                  <b>{c.name}</b>
                  <span className="muted">{c.title}</span>
                </div>
                <span className="skill-chip" style={{ ['--c' as string]: meta.color }} title={meta.name}>
                  {meta.icon} {meta.describe(c.skill.value)}
                </span>
                <div className="mc-owner">
                  {c.ownerId ? (
                    <span>
                      现属 <b style={{ color: snap.players.find((p) => p.id === c.ownerId)?.color }}>{nameOf(c.ownerId)}</b> · 上次 {fmt(c.lastPrice ?? 0)}
                    </span>
                  ) : (
                    <span className="free">自由身 · 自愿挂牌</span>
                  )}
                  {c.selfPlayerId && <span className="pill avatar-pill">分身·本人 {nameOf(c.selfPlayerId)}</span>}
                </div>
              </div>
              <div className="mc-action">
                <button
                  className={`btn ${isPoach ? 'poach' : 'primary'}`}
                  disabled={!!reason}
                  onClick={() => setConfirm(c)}
                  data-testid={`sign-${c.id}`}
                  aria-label={reason ? `${c.name}：${reason}` : `${isPoach ? '挖角' : '签约'} ${c.name}，价格 ${c.price} 金币`}
                >
                  {reason ?? (isPoach ? '挖角' : '签约')}
                </button>
                <span className="price">
                  <i className="coin sm" />
                  {fmt(c.price)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {confirm && <ConfirmTrade colleague={confirm} onClose={() => setConfirm(null)} />}
    </aside>
  );
}

function ConfirmTrade({ colleague, onClose }: { colleague: ColleagueView; onClose: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const refresh = useGame((s) => s.refresh);
  const toast = useGame((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = useRef<HTMLButtonElement>(null);
  // 价格以打开对话框时看到的为准；如果期间被他人抢先，服务端会 409 拒绝
  const [price] = useState(colleague.price);
  const live = snap.colleagues.find((c) => c.id === colleague.id) ?? colleague;
  const changed = live.price !== price || live.ownerId !== colleague.ownerId;
  const split = splitPayment(price, !!colleague.ownerId);
  const nameOf = (id: string | null) => snap.players.find((p) => p.id === id)?.name ?? '—';
  const meta = SKILL_META[colleague.skill.kind];

  useEffect(() => {
    ok.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.sign(colleague.id, price);
      toast({
        tone: 'good',
        title: `${r.trade.sellerId ? '挖角' : '签约'}成功：${colleague.name}`,
        body: `支付 ${fmt(price)} 金币，${colleague.name} 正在乘电梯赶来 ${r.trade.deskSlot + 1} 号工位…`,
      });
      await refresh();
      onClose();
      // 自动收起人才市场，让「电梯 → 走到工位 → 就座」演出完整可见
      useGame.getState().setMarketOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '交易失败，请重试');
      await refresh();
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" role="dialog" aria-modal="true" aria-labelledby="trade-title" onClick={(e) => e.stopPropagation()} data-testid="confirm-trade">
        <div className="modal-head">
          <Avatar look={colleague.look} size={64} />
          <div>
            <h3 id="trade-title">
              {colleague.ownerId ? '挖角' : '签约'} {colleague.name}
            </h3>
            <span className="skill-chip" style={{ ['--c' as string]: meta.color }}>
              {meta.icon} {meta.name}：{meta.describe(colleague.skill.value)}
            </span>
          </div>
        </div>
        <p className="muted">{colleague.bio}</p>
        <table className="split">
          <tbody>
            <tr>
              <td>你支付</td>
              <td className="num">{fmt(price)}</td>
            </tr>
            {colleague.ownerId ? (
              <tr>
                <td>原持有人「{nameOf(colleague.ownerId)}」获得 90%</td>
                <td className="num">{fmt(split.ownerShare)}</td>
              </tr>
            ) : (
              <tr>
                <td>原持有人份额（初签无原持有人）</td>
                <td className="num">0</td>
              </tr>
            )}
            <tr>
              <td>分身本人{colleague.selfPlayerId ? `「${nameOf(colleague.selfPlayerId)}」` : '（虚拟同事个人钱包）'}获得 5%</td>
              <td className="num">{fmt(split.selfShare)}</td>
            </tr>
            <tr>
              <td>系统回收{colleague.ownerId ? '（5% + 取整零头）' : '（入职费：无原持有人，原 90% 份额亦由系统回收）'}</td>
              <td className="num">{fmt(split.systemShare)}</td>
            </tr>
          </tbody>
        </table>
        <p className="fine">
          整数金币：90% 与 5% 均向下取整，零头归系统。成交后下一位买家需支付 <b>{fmt(nextPrice(price))}</b>。
        </p>
        {changed && <p className="form-error">⚠️ 行情已变化（当前 {fmt(live.price)}），提交将被服务器拒绝，请关闭后重新选择。</p>}
        {error && (
          <p className="form-error" role="alert" data-testid="trade-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button ref={ok} className={`btn ${colleague.ownerId ? 'poach' : 'primary'}`} disabled={busy} onClick={() => void submit()} data-testid="confirm-trade-ok">
            {busy ? '交易处理中…' : `确认支付 ${fmt(price)} 金币`}
          </button>
        </div>
      </div>
    </div>
  );
}
