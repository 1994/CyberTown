import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { WorldLabel } from './WorldLabel.tsx';
import * as THREE from 'three';
import type { ColleagueView } from '../../shared/types.ts';
import { SKILL_META } from '../../shared/rules.ts';
import { BOOTHS, findPath, podSeat } from '../../shared/world.ts';
import { useGame } from '../store.ts';
import { playerPos, rt, trailPoint, useWorld } from '../world/runtime.ts';
import { Character } from './Character.tsx';
import type { Rig } from './Character.tsx';
import { applyPose, idlePose, turnTowards } from './pose.ts';
import { useFx } from './Effects.tsx';
import { walkNear } from './Avatars.tsx';
import { FootRing } from './Avatars.tsx';
import { dressedColleague, isBoss } from '../look.ts';
import { Crown } from 'lucide-react';
import { useCinema } from './cinema.ts';

/**
 * 同事在园区里的位置（所有客户端按同一规则计算，因此看到的是同一个空间）：
 * - 自由身：站在人才街摊位前等人来招募；
 * - 有主且主人在线：排队跟在主人身后（小队跟随）；
 * - 有主但主人离线：坐在项目区「主人的工位组」上办公。
 * 归属变化时播放空间演出：被挖走 → 原地收拾纸箱 → 抱箱走到新老板身边 → 庆祝 + 技能激活；
 * 被招募 → 摊位前庆祝 → 走向新老板。
 */

type Assign =
  | { mode: 'booth'; i: number }
  | { mode: 'follow'; owner: string; slot: number }
  | { mode: 'desk'; owner: string; slot: number };

const SCALE = 1.12;
const TRAVEL_SPEED = 4.4;

function desired(a: Assign): { x: number; z: number; yaw: number | null } {
  if (a.mode === 'booth') {
    const b = BOOTHS[a.i % BOOTHS.length];
    return { x: b.x, z: b.z, yaw: b.face };
  }
  if (a.mode === 'desk') {
    const s = podSeat(a.owner, a.slot);
    return { x: s.x, z: s.z, yaw: 0 };
  }
  const op = playerPos(a.owner);
  if (!op) {
    const s = podSeat(a.owner, a.slot);
    return { x: s.x, z: s.z, yaw: 0 };
  }
  const [x, z] = trailPoint(a.owner, 1.5 + a.slot * 1.15, {
    x: op.x - 1 - a.slot * 0.6,
    z: op.z + 0.8,
  });
  return { x, z, yaw: null };
}

interface Run {
  x: number;
  z: number;
  yaw: number;
  trans: null | {
    kind: 'pack' | 'cheer' | 'travel' | 'arrive';
    t0: number;
    fx: boolean;
  };
  path: [number, number][] | null;
  repathAt: number;
  phase: number;
}

function ColleagueActor({
  c,
  assign,
  onlineKey,
}: {
  c: ColleagueView;
  assign: Assign;
  onlineKey: string;
}) {
  const rig = useRef<Rig>(null);
  const group = useRef<THREE.Group>(null);
  const tag = useRef<HTMLDivElement>(null);
  const bossTalk = useRef<HTMLDivElement>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const addFx = useFx((s) => s.add);
  const prev = useRef<{ owner: string | null; mode: string } | null>(null);
  const run = useRef<Run>(null!);
  const assignRef = useRef(assign);
  assignRef.current = assign;
  if (!run.current) {
    const d = desired(assign);
    run.current = {
      x: d.x,
      z: d.z,
      yaw: d.yaw ?? 0,
      trans: null,
      path: null,
      repathAt: 0,
      phase: 0,
    };
  }

  // 归属/模式变化 → 触发演出
  useEffect(() => {
    const owner = c.ownerId;
    const p = prev.current;
    prev.current = { owner, mode: assign.mode };
    if (!p) return;
    const r = run.current;
    const now = performance.now();
    if (p.owner !== owner) {
      const game = useGame.getState();
      const me = game.snapshot?.me.id;
      if ((owner === me || p.owner === me) && !game.introPlaying && !game.projectActive && !game.phoneOpen && !useWorld.getState().projectOpen) {
        const meta = SKILL_META[c.skill.kind];
        game.closePhone();
        game.setDrawer(null);
        game.setMarketOpen(false);
        useWorld.getState().setOverview(false);
        useCinema.getState().focus({
          colleagueId: c.id,
          kind: p.owner ? 'poach' : 'hire',
          title: p.owner === me ? `${c.name} 被挖走了` : `${c.name}，欢迎入队`,
          subtitle: p.owner === me ? `收拾行李，去下一站。补偿 +${Math.floor((c.lastPrice ?? 0) * 0.9)} 金币` : `${meta.describe(c.skill.value)} · 今天为你打工`,
        }, p.owner ? 6.2 : 5.5);
      }
      if (p.owner && owner) {
        r.trans = { kind: 'pack', t0: now, fx: true };
        setBubble('📦 被挖走了，收拾一下…');
      } else if (!p.owner && owner) {
        r.trans = { kind: 'cheer', t0: now, fx: true };
        const meta = SKILL_META[c.skill.kind];
        addFx({
          x: r.x,
          y: 1.4,
          z: r.z,
          color: meta.color,
          label: `${meta.icon} ${meta.describe(c.skill.value)}`,
          sub: `${c.name} 加入小队`,
        });
        setBubble('收到！这就过去 🏃');
      } else {
        r.trans = { kind: 'travel', t0: now, fx: false };
        setBubble(null);
      }
      r.path = null;
    } else if (p.mode !== assign.mode) {
      r.trans = { kind: 'travel', t0: now, fx: false };
      r.path = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.ownerId, assign.mode, onlineKey]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const R = rig.current;
    const g = group.current;
    if (!R || !g) return;
    const r = run.current;
    const a = assignRef.current;
    const d = desired(a);
    const t = state.clock.elapsedTime + c.id.length;
    const pose = idlePose(t);
    const boss = isBoss(c.id);
    const now = performance.now();
    let moving = false;
    let faceYaw: number | null = d.yaw;

    const travel = (speed: number, arriveDist: number): boolean => {
      // 目标在动（跟随主人）时定期重算路径
      const end = r.path?.[r.path.length - 1];
      if (
        !r.path ||
        now > r.repathAt ||
        (end && Math.hypot(end[0] - d.x, end[1] - d.z) > 2)
      ) {
        r.path = findPath(r.x, r.z, d.x, d.z) ?? [[d.x, d.z]];
        r.repathAt = now + 1200;
      }
      if (Math.hypot(d.x - r.x, d.z - r.z) <= arriveDist) return true;
      const target = r.path[0];
      if (!target) return true;
      const dx = target[0] - r.x;
      const dz = target[1] - r.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.1) {
        r.path.shift();
        return false;
      }
      const step = Math.min(dist, speed * dt);
      r.x += (dx / dist) * step;
      r.z += (dz / dist) * step;
      faceYaw = Math.atan2(dx, dz);
      moving = true;
      return false;
    };

    const tr = r.trans;
    if (tr) {
      const el = (now - tr.t0) / 1000;
      if (tr.kind === 'pack') {
        R.box.visible = el > 0.3;
        R.box.scale.setScalar(Math.min(1, el / 0.5));
        pose.reach = el < 1.6 ? 1 : 0;
        pose.carry = el >= 1.6 ? 1 : 0;
        faceYaw = null;
        if (el > 2.2) {
          r.trans = { kind: 'travel', t0: now, fx: tr.fx };
          setBubble('📦 换个老板打工去…');
        }
      } else if (tr.kind === 'cheer') {
        pose.celebrate = 1;
        if (el > 1.3) {
          r.trans = { kind: 'travel', t0: now, fx: tr.fx };
          setBubble(null);
        }
      } else if (tr.kind === 'travel') {
        pose.carry = R.box.visible ? 1 : 0;
        const done = travel(TRAVEL_SPEED, a.mode === 'follow' ? 1.6 : 0.15);
        if (done || el > 25) {
          R.box.visible = false;
          r.path = null;
          if (tr.fx) {
            const meta = SKILL_META[c.skill.kind];
            addFx({
              x: r.x,
              y: 1.4,
              z: r.z,
              color: meta.color,
              label: `${meta.icon} ${meta.describe(c.skill.value)}`,
              sub: `${c.name} 入职新小队`,
            });
            r.trans = { kind: 'arrive', t0: now, fx: false };
            setBubble('报到！🙋');
            if (c.ownerId === rt.myId && useCinema.getState().shot?.colleagueId === c.id && !useGame.getState().introPlaying && !useGame.getState().projectActive && !useGame.getState().phoneOpen && !useGame.getState().drawer && !useWorld.getState().projectOpen) {
              useCinema.getState().focus({
                colleagueId: c.id,
                kind: 'arrival',
                title: `${c.name}，报到`,
                subtitle: `${meta.describe(c.skill.value)} · 小队技能已激活`,
              }, 3);
            }
          } else {
            r.trans = null;
            setBubble(null);
          }
        }
      } else if (tr.kind === 'arrive') {
        pose.celebrate = 1;
        if (el > 1.4) {
          r.trans = null;
          setBubble(null);
        }
      }
    } else if (a.mode === 'follow') {
      const dist = Math.hypot(d.x - r.x, d.z - r.z);
      if (dist > 6) {
        r.trans = { kind: 'travel', t0: now, fx: false };
      } else if (dist > 0.05) {
        const nx = THREE.MathUtils.damp(r.x, d.x, 5, dt);
        const nz = THREE.MathUtils.damp(r.z, d.z, 5, dt);
        const sp = Math.hypot(nx - r.x, nz - r.z) / dt;
        if (sp > 0.25) {
          moving = true;
          faceYaw = Math.atan2(nx - r.x, nz - r.z);
        }
        r.x = nx;
        r.z = nz;
      }
      if (!moving) {
        const op = playerPos(a.owner);
        if (op) faceYaw = Math.atan2(op.x - r.x, op.z - r.z);
      }
    } else {
      const dist = Math.hypot(d.x - r.x, d.z - r.z);
      if (dist > 0.3) r.trans = { kind: 'travel', t0: now, fx: false };
      else if (a.mode === 'desk') {
        r.x = d.x;
        r.z = d.z;
        pose.sit = 1;
        pose.typing = 1;
      } else if (Math.sin(t * 0.5 + c.id.length) > 0.92) pose.wave = 1; // 摊位前偶尔招手
    }

    if (moving) {
      pose.walk = 1;
      r.phase += dt * 10;
      pose.walkPhase = r.phase;
    }
    if (boss && !r.trans) {
      R.briefcase.visible = moving;
      if (
        !moving &&
        a.mode === 'follow' &&
        useGame.getState().projectActive &&
        a.owner === rt.myId
      )
        pose.typing = 1;
      else if (!moving && Math.sin(t * 0.65) > 0.75) pose.cup = 1;
      if (bossTalk.current) {
        const lines =
          a.mode === 'booth'
            ? [
                '今天，我向你汇报。',
                '老板待命，随时上岗。',
                '你负责快乐，我负责努力。',
              ]
            : [
                '你去玩，这边有我。',
                '放心，今年奖金我来挣。',
                '今天准点下班！',
              ];
        const line = lines[Math.floor(t / 7) % lines.length];
        if (bossTalk.current.textContent !== line)
          bossTalk.current.textContent = line;
      }
    }
    if (faceYaw != null) r.yaw = turnTowards(r.yaw, faceYaw, dt, 8);
    g.position.set(r.x, 0, r.z);
    g.rotation.y = r.yaw;
    applyPose(R, pose, dt);
    rt.colleaguePos.set(c.id, { x: r.x, z: r.z, yaw: r.yaw });
    // 远处的名牌隐藏，减少画面杂讯
    if (tag.current) {
      const far =
        useWorld.getState().overview ||
        Math.hypot(rt.me.x - r.x, rt.me.z - r.z) > 15;
      tag.current.style.opacity = far ? '0' : '1';
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return;
    const r = run.current;
    if (
      c.ownerId === useGame.getState().snapshot?.me.id &&
      Math.hypot(rt.me.x - r.x, rt.me.z - r.z) < 4
    ) {
      useGame.getState().setDrawer('squad');
      return;
    }
    walkNear(r.x, r.z, 1.5);
  };

  const meta = SKILL_META[c.skill.kind];
  const snapshot = useGame((s) => s.snapshot);
  const owner = snapshot?.players.find((p) => p.id === c.ownerId);
  const self = snapshot?.players.find((p) => p.id === c.selfPlayerId);
  const mine = c.ownerId === snapshot?.me.id;
  const boss = isBoss(c.id);
  const look = dressedColleague(c, owner?.style);
  return (
    <group ref={group} onClick={onClick}>
      {boss && <FootRing color={owner?.style.bossAura || '#d0a34e'} />}
      <Character ref={rig} look={look} scale={boss ? SCALE * 1.08 : SCALE} />
      <WorldLabel
        position={[0, boss ? 2.4 : 2.15, 0]}
        center
        zIndexRange={[15, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          ref={tag}
          className={`ctag ${mine ? 'mine' : ''} ${boss ? 'boss-tag' : ''}`}
          data-colleague={c.id}
          data-owner={c.ownerId ?? ''}
        >
          {bubble && <div className="bubble">{bubble}</div>}
          {boss && !bubble && (
            <div className="boss-thought" ref={bossTalk}>
              今天，我向你汇报。
            </div>
          )}
          <div className="cname">
            <span className="cicon" style={{ background: meta.color }}>
              {boss ? <Crown size={12} /> : meta.icon}
            </span>
            {self ? `${self.name}的分身` : c.name}
            {!c.ownerId && <em className="cprice">{c.price}</em>}
            {owner && !mine && (
              <i
                className="cowner"
                style={{ background: owner.color }}
                title={`属于${owner.name}`}
              />
            )}
          </div>
        </div>
      </WorldLabel>
    </group>
  );
}

export function Colleagues() {
  const snapshot = useGame((s) => s.snapshot);
  const onlineIds = useWorld((s) => s.players.map((p) => p.id).sort().join(','));
  // 自己永远算在线（即便 SSE 还没连上），保证自己的小队跟随自己
  const myId = snapshot?.me.id;
  const online = useMemo(
    () => new Set([...onlineIds.split(',').filter(Boolean), ...(myId ? [myId] : [])]),
    [onlineIds, myId],
  );
  const onlineKey = [...online].sort().join(',');
  if (!snapshot) return null;
  return (
    <>
      {snapshot.colleagues.map((c, i) => {
        let assign: Assign;
        if (!c.ownerId) assign = { mode: 'booth', i };
        else if (online.has(c.ownerId))
          assign = { mode: 'follow', owner: c.ownerId, slot: c.deskSlot ?? 0 };
        else assign = { mode: 'desk', owner: c.ownerId, slot: c.deskSlot ?? 0 };
        return (
          <ColleagueActor
            key={c.id}
            c={c}
            assign={assign}
            onlineKey={onlineKey}
          />
        );
      })}
    </>
  );
}
