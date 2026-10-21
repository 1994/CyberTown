import { nearbyPlayers } from '../../shared/proximity.ts';
import { sound } from '../audio.ts';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Coins,
  Crown,
  Gamepad2,
  Gift,
  Glasses,
  MapPin,
  PartyPopper,
  Shirt,
  ShoppingBag,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api.ts';
import { dressed, dressedColleague, isBoss, tryOn } from '../look.ts';
import { myTeam, useGame } from '../store.ts';
import { useWorld } from '../world/runtime.ts';
import { goToPlayer } from '../world/navigation.ts';
import { Portrait } from '../scene/Portrait.tsx';
import { Avatar } from './Avatar.tsx';
import { CountUp, fmt } from './common.tsx';
import { ConfirmTrade, blockReason } from './Confirm.tsx';
import type { ColleagueView } from '../../shared/types.ts';

function Modal({
  title,
  label,
  children,
  onClose,
  className = '',
}: {
  title: string;
  label: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    useWorld.getState().lock('progression');
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs.item(dialogs.length - 1) !== ref.current) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
      if (e.key === 'Tab') {
        const buttons = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,a[href],[tabindex="0"]',
          ) ?? [],
        );
        if (!buttons.length) {
          e.preventDefault();
          return;
        }
        const i = buttons.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          buttons.at(-1)?.focus();
        } else if (!e.shiftKey && (i < 0 || i === buttons.length - 1)) {
          e.preventDefault();
          buttons[0].focus();
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      useWorld.getState().unlock('progression');
      window.removeEventListener('keydown', key);
      before?.isConnected && before.focus();
    };
  }, []);
  return (
    <div
      className="v3-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={`v3-modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="v3-modal-head">
          <div>
            {label && <span className="eyebrow">{label}</span>}
            <h2>{title}</h2>
          </div>
          <button
            className="v3-icon"
            onClick={onClose}
            aria-label="关闭"
            data-testid="progression-close"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function WalletCard() {
  const snap = useGame((s) => s.snapshot)!;
  const identityMode = useGame((s) => s.identityMode);
  const setDrawer = useGame((s) => s.setDrawer);
  const avatar = snap.colleagues.find(
    (c) => c.id === snap.me.avatarColleagueId,
  )!;
  const c = snap.career;
  return (
    <section className="wallet-card" aria-label="我的状态">
      <button
        className="wallet-person"
        onClick={() => setDrawer('career')}
        aria-label="查看晋升成长"
      >
        <Avatar look={dressed(avatar.look, snap.me.style)} size={48} />
        <span>
          <b>
            {snap.me.name}
            {identityMode !== 'sso' && <i className="demo-tag">{identityMode === 'mock' ? 'Mock身份' : '体验身份'}</i>}
          </b>
          <small>
            <Crown size={12} />
            {c.name}
            <ChevronRight size={12} />
          </small>
        </span>
        {c.canPromote && <em className="promotion-dot">可晋升</em>}
      </button>
      <button
        className="wallet-money"
        onClick={() => setDrawer('shop')}
        aria-label="打开道具商店"
      >
        <Coins size={19} />
        <span data-testid="my-coins" data-value={snap.me.coins}>
          <CountUp value={snap.me.coins} />
        </span>
        <ShoppingBag size={15} />
      </button>
    </section>
  );
}

export function YearCard() {
  const y = useGame((s) => s.snapshot!.year);
  const setDrawer = useGame((s) => s.setDrawer);
  return (
    <button
      className="year-card"
      onClick={() => setDrawer('career')}
      aria-label={`第${y.number}年，已完成${y.completed}场，查看年终奖`}
      data-testid="year-card"
    >
      <span className="year-stamp">
        <Gift size={23} />
      </span>
      <span className="year-copy">
        <small>第 {y.number} 年</small>
        <b>
          预计奖金{' '}
          <span>
            {fmt(y.estimate)}
            <Coins size={13} />
          </span>
        </b>
        <span className="year-steps">
          {Array.from({ length: y.required }, (_, i) => (
            <i key={i} className={i < y.completed ? 'done' : ''}>
              {i < y.completed ? <Check size={10} /> : null}
            </i>
          ))}
          <em>{y.completed >= y.required ? '可以发奖啦' : `再玩 ${y.required - y.completed} 场`}</em>
        </span>
      </span>
      <ChevronRight size={15} />
    </button>
  );
}

export function QuickSquad() {
  const snap = useGame((s) => s.snapshot)!;
  const setDrawer = useGame((s) => s.setDrawer);
  const team = myTeam(snap);
  return (
    <button
      className="quick-squad"
      onClick={() => setDrawer('squad')}
      aria-label={`查看我的小队，${team.length}名成员`}
    >
      <span className="quick-squad-title">
        小队 <small>{team.length}/3</small>
      </span>
      <span className="quick-faces">
        {Array.from({ length: 3 }, (_, i) => {
          const c = team.find((t) => t.deskSlot === i);
          return (
            <span
              key={i}
              className={`quick-face ${c ? 'filled' : ''}`}
              data-testid={`team-slot-${i}`}
              title={c?.name ?? '空位'}
            >
              {c ? (
                <Avatar
                  look={dressedColleague(c, snap.me.style)}
                  size={36}
                />
              ) : (
                <Users size={16} />
              )}
            </span>
          );
        })}
        <ChevronRight size={14} />
      </span>
    </button>
  );
}

function CareerPanel() {
  const snap = useGame((s) => s.snapshot)!;
  const { career: c, year: y } = snap;
  const setDrawer = useGame((s) => s.setDrawer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const promote = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { promotion: p } = await api.promote(c.rank);
      await useGame.getState().refresh();
      setDrawer(null);
      useGame.getState().celebrate({
        key: `promotion:${p.playerId}:${p.toRank}:${p.at}`,
        title: `晋升 · ${p.rankName}`,
        body: `新一年的基础奖金更高了，下一局收益加成 +${p.incomePct}%`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '晋升失败');
      await useGame.getState().refresh();
      setBusy(false);
    }
  };
  const goPlay = () => {
    setDrawer(null);
    useWorld.getState().setProjectOpen(true);
  };
  const n = c.next;
  const perfLeft = n ? Math.max(0, n.requiredPerformance - c.performance) : 0;
  const projLeft = n ? Math.max(0, n.requiredProjects - c.completedProjects) : 0;
  const pct = (have: number, need: number) => `${Math.min(100, need ? (have / need) * 100 : 100)}%`;
  return (
    <div className="career-content">
      <div className="career-rank">
        <span className="career-emblem">
          <Crown size={30} strokeWidth={1.8} />
        </span>
        <div className="career-now">
          <small>当前职级</small>
          <h3>{c.name}</h3>
          <span>收益加成 +{c.incomePct}%</span>
        </div>
        {n && (
          <>
            <ArrowRight className="career-arrow" size={18} />
            <div className="career-to">
              <small>下一级</small>
              <b>{n.name}</b>
              <span>收益 +{n.incomePct}%</span>
            </div>
          </>
        )}
      </div>
      {n ? (
        <div className="career-reqs">
          <div className={perfLeft ? '' : 'met'}>
            <header>
              <span>成长值</span>
              <b>
                {fmt(Math.min(c.performance, n.requiredPerformance))}
                <small>/ {fmt(n.requiredPerformance)}</small>
              </b>
            </header>
            <div className="growth-track"><i style={{ width: pct(c.performance, n.requiredPerformance) }} /></div>
            <small>{perfLeft ? `还差 ${fmt(perfLeft)} · 每次接住 +10` : '已达成'}</small>
          </div>
          <div className={projLeft ? '' : 'met'}>
            <header>
              <span>有效游玩</span>
              <b>
                {Math.min(c.completedProjects, n.requiredProjects)}
                <small>/ {n.requiredProjects} 场</small>
              </b>
            </header>
            <div className="growth-track"><i style={{ width: pct(c.completedProjects, n.requiredProjects) }} /></div>
            <small>{projLeft ? `还差 ${projLeft} 场有命中的游戏` : '已达成'}</small>
          </div>
        </div>
      ) : (
        <p className="career-max">最高职级已达成，继续和朋友一起玩。</p>
      )}
      <div className="year-summary">
        <div>
          <Gift size={22} />
          <span>
            第 {y.number} 年 · 预计年终奖
            <b>{fmt(y.estimate)} 金币</b>
            <small>基础 {fmt(y.base)} · 已玩 {Math.min(y.completed, y.required)}/{y.required} 场</small>
          </span>
        </div>
        <div>
          <Users size={22} />
          <span>
            好友碰杯
            <b>{y.friendPct ? `奖金 +${y.friendPct}%` : '还没碰杯'}</b>
            <small>{y.friendPct ? '已计入本年' : '走近好友碰杯可加成'}</small>
          </span>
        </div>
      </div>
      {y.lastAward && (
        <p className="last-award">
          上一份年终奖 <b>+{fmt(y.lastAward.total)}</b> · 已到账
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!c.canPromote && !busy && (
        <button className="v3-primary wide" onClick={goPlay} data-testid="career-play">
          <Gamepad2 size={18} />
          {n ? '去玩一局，攒成长值' : '去玩一局'}
        </button>
      )}
      <button
        className={c.canPromote || busy ? 'v3-primary wide' : 'v3-secondary wide career-locked'}
        disabled={!c.canPromote || busy}
        onClick={() => void promote()}
        data-testid="btn-promote"
      >
        <Sparkles size={17} />
        {busy
          ? '晋升中…'
          : c.canPromote
            ? `晋升为${n?.name ?? '下一级'}`
            : n
              ? '条件达成后即可晋升'
              : '合伙人，今天你最大'}
      </button>
      <p className="quiet-note">每 {y.required} 场有命中的小游戏算一年，进度自动保存。</p>
    </div>
  );
}

function ShopPanel() {
  const snap = useGame((s) => s.snapshot)!;
  const [target, setTarget] = useState<'player' | 'boss'>('player');
  const [selected, setSelected] = useState(snap.shop[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const item = snap.shop.find((i) => i.id === selected);
  const av = snap.colleagues.find((c) => c.id === snap.me.avatarColleagueId)!;
  const boss =
    myTeam(snap).find((c) => isBoss(c.id)) ??
    snap.colleagues.find((c) => c.id === 'c-zhang')!;
  const base = dressed(
    target === 'boss' ? boss.look : av.look,
    snap.me.style,
    target === 'boss',
  );
  const look = tryOn(base, item);
  const aura =
    item?.kind === 'aura'
      ? item.value
      : target === 'boss'
        ? snap.me.style.bossAura
        : snap.me.style.aura;
  const key = item
    ? ((target === 'boss'
        ? `boss${item.kind[0].toUpperCase()}${item.kind.slice(1)}`
        : item.kind) as keyof typeof snap.me.style)
    : 'shirt';
  const keyFor = (kind: string) =>
    (target === 'boss' ? `boss${kind[0].toUpperCase()}${kind.slice(1)}` : kind) as keyof typeof snap.me.style;
  const equipped = !!item && snap.me.style[key] === item.value;
  const short = item && !item.owned ? Math.max(0, item.price - snap.me.coins) : 0;
  const goPlay = () => {
    useGame.getState().setDrawer(null);
    useWorld.getState().setProjectOpen(true);
  };
  const act = async () => {
    if (!item || busy) return;
    setBusy(true);
    setError('');
    try {
      if (!item.owned) await api.buyItem(item.id, item.price);
      await api.equipItem(item.id, item.kind, target);
      sound.play('equip');
      await useGame.getState().refresh();
      useGame.getState().toast({
        tone: 'good',
        title:
          target === 'boss'
            ? boss.ownerId === snap.me.id
              ? `${boss.name}穿上了${item.name}`
              : `老板穿搭已保存，雇佣后生效`
            : `已穿上${item.name}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '兑换失败');
      await useGame.getState().refresh();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!item || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.equipItem('', item.kind, target);
      await useGame.getState().refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '更换失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="shop-layout">
      <section className="fitting-room" aria-label="3D试衣间">
        <div className="segmented">
          <button
            className={target === 'player' ? 'active' : ''}
            onClick={() => setTarget('player')}
          >
            给自己
          </button>
          <button
            className={target === 'boss' ? 'active' : ''}
            onClick={() => setTarget('boss')}
          >
            给老板
          </button>
        </div>
        <div className="fitting-model">
          <Portrait look={look} aura={aura} />
        </div>
        <div className="fitting-label">
          <span className="eyebrow">
            {target === 'boss' ? '老板也要有点样子' : '快乐，就是你的穿搭'}
          </span>
          <b>{target === 'boss' ? boss.name : snap.me.name}</b>
          <small>
            {target === 'boss' && boss.ownerId !== snap.me.id
              ? '穿搭保存，雇佣后生效'
              : '拖动人物，看看另一面'}
          </small>
        </div>
      </section>
      <section className="shop-products">
        <div className="shop-wallet">
          <span>我的金币</span>
          <b>
            <Coins size={18} />
            {fmt(snap.me.coins)}
          </b>
        </div>
        <div className="product-grid">
          {snap.shop.map((i) => {
            const Icon =
              i.kind === 'shirt'
                ? Shirt
                : i.kind === 'accessory'
                  ? Glasses
                  : Sparkles;
            const wearing = snap.me.style[keyFor(i.kind)] === i.value;
            const poor = !i.owned && snap.me.coins < i.price;
            return (
              <button
                key={i.id}
                className={`product ${selected === i.id ? 'selected' : ''} ${i.owned ? 'owned' : ''} ${wearing ? 'wearing' : ''} ${poor ? 'poor' : ''}`}
                onClick={() => {
                  setSelected(i.id);
                  setError('');
                }}
                data-testid={`shop-item-${i.id}`}
                aria-pressed={selected === i.id}
              >
                <span
                  className="product-visual"
                  style={
                    {
                      '--item-color':
                        i.kind === 'accessory' ? '#9fcae6' : i.value,
                    } as React.CSSProperties
                  }
                >
                  <Icon size={38} strokeWidth={1.4} />
                  {i.owned && (
                    <i>
                      <Check size={11} />
                    </i>
                  )}
                </span>
                <b>{i.name}</b>
                <small>
                  {wearing ? (
                    '穿戴中'
                  ) : i.owned ? (
                    '已拥有'
                  ) : (
                    <>
                      <Coins size={12} />
                      {i.price}
                    </>
                  )}
                </small>
              </button>
            );
          })}
        </div>
        {item && (
          <div className="product-action">
            <div>
              <b>{item.name}</b>
              <p>{item.description}</p>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="v3-primary wide"
              disabled={
                busy || equipped || (!item.owned && snap.me.coins < item.price)
              }
              onClick={() => void act()}
              data-testid="shop-purchase"
            >
              {equipped ? <Check size={16} /> : <ShoppingBag size={16} />}
              {busy
                ? '正在准备…'
                : equipped
                  ? '已穿戴'
                  : item.owned
                    ? '穿上试试'
                    : short > 0
                      ? `还差 ${fmt(short)} 金币`
                      : `兑换并穿上 · ${item.price}`}
            </button>
            {short > 0 && !busy && (
              <button className="text-btn shop-earn" onClick={goPlay} data-testid="shop-go-play">
                <Gamepad2 size={15} />
                去玩一局赚金币
              </button>
            )}
            {equipped && (
              <button
                className="text-btn"
                onClick={() => void remove()}
                disabled={busy}
                data-testid="shop-remove"
              >
                换回原装
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SquadPanel() {
  const snap = useGame((s) => s.snapshot)!;
  const team = myTeam(snap);
  const [confirm, setConfirm] = useState<ColleagueView | null>(null);
  const setDrawer = useGame((s) => s.setDrawer);
  const boss = snap.colleagues.find((c) => c.id === 'c-zhang')!;
  const featured = team.length ? team[0] : boss;
  const mine = featured.ownerId === snap.me.id;
  return (
    <div className="squad-layout">
      <div className="squad-portrait">
        <span className="role-ribbon">
          <Crown size={14} />
          {isBoss(featured.id) ? '高能老板' : '我的搭档'}
        </span>
        <Portrait
          look={dressedColleague(featured, mine ? snap.me.style : undefined)}
          wave
        />
        <div className="boss-quote">
          {team.length ? '“你去玩，这边有我。”' : '“今天，我向你汇报。”'}
        </div>
      </div>
      <div className="squad-detail">
        <span className="eyebrow">让你的队伍，替你多挣一点</span>
        <h3>{team.length ? '今天的快乐搭子' : '老板，加入我的小队'}</h3>
        <div className="squad-members">
          {(team.length ? team : [boss]).map((c) => (
            <div key={c.id} className="squad-member">
              <Avatar
                look={dressedColleague(c, mine ? snap.me.style : undefined)}
                size={52}
              />
              <span>
                <b>
                  {c.name}
                  {isBoss(c.id) && <Crown size={13} />}
                </b>
                <small>{c.title}</small>
              </span>
              <em>
                {c.skill.kind === 'income'
                  ? `收益 +${c.skill.value}%`
                  : c.skill.kind === 'time'
                    ? `多玩 ${c.skill.value} 秒`
                    : `救场 ${c.skill.value} 次`}
              </em>
            </div>
          ))}
        </div>
        <p className="squad-tip">
          {team.length
            ? '带着队员散步。去商店，还能给老板挑一身新衣服。'
            : '老板能力更强，能帮你提高收益。先雇一位，一起出发。'}
        </p>
        {!team.length ? (
          <button
            className="v3-primary wide"
            disabled={!!blockReason(boss, snap)}
            onClick={() => setConfirm(boss)}
            data-testid="hire-boss"
          >
            <Crown size={17} />
            {blockReason(boss, snap) ?? `雇佣${boss.name} · ${boss.price}`}
          </button>
        ) : (
          <button className="v3-primary wide" onClick={() => setDrawer('shop')}>
            <Shirt size={17} />
            给队伍挑件新衣服
          </button>
        )}
        <button className="text-btn" onClick={() => setDrawer('market')}>
          看看其他同事 <ArrowRight size={14} />
        </button>
      </div>
      {confirm && (
        <ConfirmTrade colleague={confirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

function FriendsPanel() {
  const snap = useGame((s) => s.snapshot)!;
  const players = useWorld((s) => s.players);
  const setDrawer = useGame((s) => s.setDrawer);
  const others = snap.players.filter((p) => p.id !== snap.me.id);
  const onlineOthers = others.filter((p) => p.online);
  const nearby = new Set(nearbyPlayers(players, snap.me.id).map(p => p.id));
  return (
    <div className="friends-content">
      <div className="friends-intro">
        <Users size={32} />
        <h3>在这里，遇见熟悉的人。</h3>
        <p>走近挥手、聊一句，或碰杯一起拿奖金加成。</p>
      </div>
      {onlineOthers.length === 0 && (
        <div className="friends-empty">
          <b>暂时没有在线搭子</b>
          <span>一个人也能招募 NPC 老板、玩小游戏、晋升领年终奖。同事来了再一起逛。</span>
          <button className="v3-secondary" onClick={() => setDrawer('market')}>
            <Users size={15} />
            先看看园区同事
          </button>
        </div>
      )}
      {others.map((p) => {
        const live = p.online;
        const av = snap.colleagues.find((c) => c.id === p.avatarColleagueId)!;
        return (
          <div className="friend-row" key={p.id}>
            <Avatar look={dressed(av.look, p.style)} size={48} />
            <span>
              <b>
                {p.name}
                <i className={live ? 'online' : 'offline'} />
              </b>
              <small>
                {p.rankName} · {live ? nearby.has(p.id) ? '就在附近' : '正在园区散步' : '暂时离线'}
              </small>
            </span>
            <button
              className="v3-secondary"
              disabled={!live}
              onClick={() => { void goToPlayer(p.id).catch(() => useGame.getState().toast({ tone: 'info', title: '对方暂时离开了' })); }}
            >
              <MapPin size={14} />
              {live ? '去找TA' : '离线'}
            </button>
          </div>
        );
      })}

    </div>
  );
}

export function Progression() {
  const drawer = useGame((s) => s.drawer);
  const setDrawer = useGame((s) => s.setDrawer);
  const celebration = useGame((s) => s.celebration);
  const closeCelebration = useGame((s) => s.closeCelebration);
  if (celebration)
    return (
      <Modal
        title={celebration.title}
        label=""
        onClose={closeCelebration}
        className="celebration-modal"
      >
        <div className="celebration-body">
          <span className="celebration-emblem">
            {celebration.amount ? (
              <Gift size={56} strokeWidth={1.3} />
            ) : (
              <Trophy size={56} strokeWidth={1.3} />
            )}
          </span>
          {celebration.amount != null && (
            <div className="award-number">
              +<CountUp value={celebration.amount} />
              <Coins size={25} />
            </div>
          )}
          <p>{celebration.body}</p>
          <div className="celebration-confetti" aria-hidden="true">
            {Array.from({ length: 22 }, (_, i) => (
              <i key={i} style={{ '--i': i } as React.CSSProperties} />
            ))}
          </div>
          <button
            className="v3-primary wide"
            onClick={() => {
              closeCelebration();
              setDrawer(celebration.amount ? 'shop' : null);
            }}
          >
            <PartyPopper size={18} />
            {celebration.amount ? '去换点喜欢的' : '今天我最大'}
          </button>
        </div>
      </Modal>
    );
  if (!drawer || !['career', 'shop', 'squad', 'friends'].includes(drawer))
    return null;
  const titles = {
    career: ['我的成长', ''],
    shop: ['年终好物商店', ''],
    squad: ['我的快乐小队', ''],
    friends: ['一起逛园区', ''],
  } as const;
  const [title, label] = titles[drawer as keyof typeof titles];
  return (
    <Modal
      title={title}
      label={label}
      onClose={() => setDrawer(null)}
      className={`modal-${drawer}`}
      key={drawer}
    >
      {drawer === 'career' ? (
        <CareerPanel />
      ) : drawer === 'shop' ? (
        <ShopPanel />
      ) : drawer === 'squad' ? (
        <SquadPanel />
      ) : (
        <FriendsPanel />
      )}
    </Modal>
  );
}
