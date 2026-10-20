import { createPortal } from 'react-dom';
import { sound } from '../audio.ts';
import { dressedColleague } from '../look.ts';
import { useEffect, useRef, useState } from 'react';
import { MAX_TEAM, SKILL_META, splitPayment } from '../../shared/rules.ts';
import type { ColleagueView, StateSnapshot } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { myTeam, useGame } from '../store.ts';
import { useWorld } from '../world/runtime.ts';
import { Avatar } from './Avatar.tsx';
import { fmt } from './common.tsx';

/** 不能招募的原因（短句，用于禁用按钮） */
export function blockReason(
  c: ColleagueView,
  snap: StateSnapshot,
): string | null {
  if (c.ownerId === snap.me.id) return '已在队里';
  if (c.selfPlayerId === snap.me.id) return '你的分身';
  if (myTeam(snap).length >= MAX_TEAM) return '队伍已满';
  if (snap.me.coins < c.price) return '金币不够';
  return null;
}

export const skillShort = (c: ColleagueView) => {
  const m = SKILL_META[c.skill.kind];
  const v =
    c.skill.kind === 'income'
      ? `+${c.skill.value}%`
      : c.skill.kind === 'time'
        ? `+${c.skill.value}s`
        : `×${c.skill.value}`;
  return `${m.icon}${v}`;
};

export function displayName(c: ColleagueView, snap: StateSnapshot) {
  const self = snap.players.find((p) => p.id === c.selfPlayerId);
  return self ? `${self.name}的分身` : c.name;
}

/** 花钱前的价格确认：一个价格 + 一个按钮；分账明细折叠在二级 */
export function ConfirmTrade({
  colleague,
  onClose,
}: {
  colleague: ColleagueView;
  onClose: () => void;
}) {
  const snap = useGame((s) => s.snapshot)!;
  const refresh = useGame((s) => s.refresh);
  const toast = useGame((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [price] = useState(colleague.price);
  const ok = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const owner = snap.players.find((p) => p.id === colleague.ownerId);
  const selfP = snap.players.find((p) => p.id === colleague.selfPlayerId);
  const split = splitPayment(price, !!colleague.ownerId);
  const poach = !!colleague.ownerId;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    useWorld.getState().lock('confirm');
    ok.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const buttons = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),summary',
          ) ?? [],
        );
        const i = buttons.indexOf(document.activeElement as HTMLElement);
        if (!buttons.length) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          buttons.at(-1)?.focus();
        } else if (!e.shiftKey && (i < 0 || i === buttons.length - 1)) {
          e.preventDefault();
          buttons[0]?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      useWorld.getState().unlock('confirm');
      if (before?.isConnected) before.focus();
    };
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { trade } = await api.sign(colleague.id, price);
      sound.play('hire', { key: `trade:${trade.colleagueId}:${trade.at}` });
      toast({
        tone: 'good',
        title: `${poach ? '挖来了' : '招到了'}${displayName(colleague, snap)}！正赶来你身边`,
      });
      await refresh();
      onClose();
    } catch (e) {
      sound.play('miss');
      setError(e instanceof ApiError ? e.message : '交易失败，请重试');
      await refresh();
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialog}
        className="modal panel confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="confirm-trade"
      >
        <Avatar look={dressedColleague(colleague, owner?.style)} size={72} ring={owner?.color} />
        <h3 id="trade-title">
          {poach ? `从${owner?.name ?? '对方'}手里挖走` : '招募'}{' '}
          {displayName(colleague, snap)}？
        </h3>
        <div className="confirm-skill">
          {SKILL_META[colleague.skill.kind].describe(colleague.skill.value)}
        </div>
        <div className="confirm-price">
          <i className="coin" />
          {fmt(price)}
        </div>
        <details className="split-details">
          <summary>钱去哪了</summary>
          <ul>
            {poach ? (
              <li>
                原老板{owner?.name} +{fmt(split.ownerShare)}（90%）
              </li>
            ) : (
              <li>初签无原老板</li>
            )}
            <li>
              {selfP ? `${selfP.name}本人` : '同事本人'} +{fmt(split.selfShare)}
              （5%）
            </li>
            <li>系统回收 {fmt(split.systemShare)}</li>
          </ul>
        </details>
        {error && (
          <p className="form-error" role="alert" data-testid="trade-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            算了
          </button>
          <button
            ref={ok}
            className={`btn ${poach ? 'poach' : 'primary'}`}
            disabled={busy}
            onClick={() => void submit()}
            data-testid="confirm-trade-ok"
          >
            {busy ? '处理中…' : `支付 ${fmt(price)}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
