import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { ColleagueView, Look } from '../../shared/types.ts';
import { SKILL_META } from '../../shared/rules.ts';
import { useGame, myTeam } from '../store.ts';
import { Character } from './Character.tsx';
import type { Rig } from './Character.tsx';
import { AISLE_Z, BOSS_DESK, DESK_SLOTS, ELEVATOR, pathFromElevator, pathToElevator } from './layout.ts';
import type { V2 } from './layout.ts';
import { Chair, Desk, deskLive } from './Furniture.tsx';
import { elevatorDoor } from './Room.tsx';
import { useFx } from './Effects.tsx';
import { useFocus } from './focus.ts';

type Mode = 'arrive' | 'seated' | 'depart';

export interface ActorEntry {
  key: string;
  colleague: ColleagueView;
  slot: number;
  mode: Mode;
  /** 离场角色已真正走离工位（按实际位移判断），此后才显示空工位/补偿牌 */
  leftDesk?: boolean;
}

const SLOT_ACCENTS = ['#3ef0ff', '#ffd166', '#ff4fb8'];
const WALK_SPEED = 2.05;
const SEAT_LIFT = 0.04;
const ACTOR_SCALE = 1.2;

/** 各工位上正在离场的角色（模块内共享，供空工位逻辑判断，不挂到 window） */
const departingSlots = new Map<string, number>();

// ───────────────────── 姿态工具 ─────────────────────

function damp(cur: number, target: number, dt: number, l = 10) {
  return THREE.MathUtils.damp(cur, target, l, dt);
}

interface PoseTarget {
  sit: number; // 0 站 / 1 坐
  walk: number; // 步态相位强度
  walkPhase: number;
  typing: number;
  carry: number; // 抱箱
  celebrate: number;
  reach: number; // 收拾东西伸手
  wave: number;
  t: number;
}

function applyPose(rig: Rig, p: PoseTarget, dt: number) {
  const sw = Math.sin(p.walkPhase) * p.walk;
  const bounce = Math.abs(Math.cos(p.walkPhase)) * 0.05 * p.walk;
  const jump = p.celebrate > 0 ? Math.abs(Math.sin(p.t * 7)) * 0.22 * p.celebrate : 0;
  rig.body.position.y = damp(rig.body.position.y, p.sit * SEAT_LIFT + bounce + jump, dt, 14);
  // 腿
  const legSit = -1.45 * p.sit;
  rig.legL.rotation.x = damp(rig.legL.rotation.x, legSit + sw * 0.6, dt, 16);
  rig.legR.rotation.x = damp(rig.legR.rotation.x, legSit - sw * 0.6, dt, 16);
  // 手臂
  const typeL = p.typing ? Math.sin(p.t * 16) * 0.12 : 0;
  const typeR = p.typing ? Math.sin(p.t * 16 + 1.7) * 0.12 : 0;
  const reach = p.reach ? (Math.sin(p.t * 5) * 0.5 + 0.5) : 0;
  let ax = -sw * 0.5;
  let axR = sw * 0.5;
  ax += (-1.15 + typeL) * p.typing + -1.35 * p.carry + (-0.9 - reach * 0.6) * p.reach;
  axR += (-1.15 + typeR) * p.typing + -1.35 * p.carry + (-0.9 - (1 - reach) * 0.6) * p.reach;
  rig.armL.rotation.x = damp(rig.armL.rotation.x, ax, dt, 14);
  rig.armR.rotation.x = damp(rig.armR.rotation.x, axR - 2.6 * p.wave + Math.sin(p.t * 10) * 0.25 * p.wave, dt, 14);
  rig.armL.rotation.z = damp(rig.armL.rotation.z, -2.5 * p.celebrate + 0.25 * p.carry, dt, 12);
  rig.armR.rotation.z = damp(rig.armR.rotation.z, 2.5 * p.celebrate - 0.25 * p.carry + 0.3 * p.wave, dt, 12);
  // 头部小动作
  rig.head.rotation.y = damp(rig.head.rotation.y, Math.sin(p.t * 0.7) * 0.15 * (1 - p.walk), dt, 4);
  rig.head.rotation.x = damp(rig.head.rotation.x, p.typing ? 0.12 + Math.sin(p.t * 3) * 0.03 : 0, dt, 6);
  rig.torso.rotation.z = Math.sin(p.walkPhase) * 0.04 * p.walk;
}

function seatPos(slot: number) {
  const d = DESK_SLOTS[slot];
  return new THREE.Vector3(d.x, 0, d.seatZ - 0.05);
}

// ───────────────────── 单个角色演员 ─────────────────────

interface Runtime {
  phase: string;
  t0: number;
  path: V2[];
  idx: number;
  pos: THREE.Vector3;
  heading: number;
  bubble: string | null;
  fired: boolean;
  leftDesk: boolean;
}

function Actor({ entry, onDone, onLeftDesk }: { entry: ActorEntry; onDone: (key: string) => void; onLeftDesk: (key: string) => void }) {
  const rig = useRef<Rig>(null);
  const group = useRef<THREE.Group>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>(entry.mode === 'arrive' ? 'elevator' : 'work');
  const addFx = useFx((s) => s.add);
  const c = entry.colleague;
  const slot = entry.slot;
  const rt = useRef<Runtime>(null!);
  if (!rt.current) {
    const arriving = entry.mode === 'arrive';
    const start = arriving ? new THREE.Vector3(ELEVATOR.x, 0, ELEVATOR.cabZ) : seatPos(slot);
    rt.current = {
      phase: arriving ? 'elevator' : 'work',
      t0: performance.now(),
      path: arriving ? pathFromElevator(slot) : [],
      idx: 1,
      pos: start,
      heading: arriving ? 0 : 0,
      bubble: null,
      fired: false,
      leftDesk: false,
    };
    if (!arriving) {
      deskLive[slot].itemsScale = 1;
      deskLive[slot].screenOn = 1;
    }
  }

  // 模式切换为离场
  useEffect(() => {
    const r = rt.current;
    if (entry.mode === 'depart' && !r.phase.startsWith('d-')) {
      if (r.phase === 'work' || r.phase === 'sit' || r.phase === 'celebrate') go('d-shock');
      else {
        // 还在入场路上就被挖走：直接掉头回电梯
        r.path = [[r.pos.x, r.pos.z], [r.pos.x, AISLE_Z], ...pathToElevator(slot).slice(2)];
        r.idx = 1;
        go('d-walk');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.mode]);

  useEffect(() => {
    if (entry.mode === 'depart') departingSlots.set(entry.key, slot);
  }, [entry.mode, entry.key, slot]);
  useEffect(
    () => () => {
      elevatorDoor.requests.delete(entry.key);
      departingSlots.delete(entry.key);
    },
    [entry.key],
  );

  function go(phase: string) {
    const r = rt.current;
    const desk = DESK_SLOTS[slot];
    if (phase === 'turn') useFocus.getState().focusOn(desk.x, desk.seatZ + 0.3, 4.6);
    if (phase === 'd-shock') useFocus.getState().focusOn(desk.x, desk.seatZ + 0.3, 6.2);
    r.phase = phase;
    r.t0 = performance.now();
    const say: Record<string, string | null> = {
      elevator: `叮～ ${c.name} 来报到啦！`,
      walk: '大家好 👋',
      sit: null,
      celebrate: '开工！',
      work: null,
      'd-shock': '😱 我…被挖走了？！',
      'd-stand': '唉，那我收拾一下…',
      'd-pack': '📦 收拾东西中…',
      'd-walk': '各位江湖再见 👋',
      'd-enter': '拜拜～',
    };
    if (phase in say) {
      r.bubble = say[phase];
      setBubble(say[phase]);
    }
    setPhase(phase);
  }

  useEffect(() => {
    if (entry.mode === 'arrive') go('elevator');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const R = rig.current;
    const g = group.current;
    if (!R || !g) return;
    const r = rt.current;
    const el = (performance.now() - r.t0) / 1000;
    const t = state.clock.elapsedTime + slot * 1.3;
    const live = deskLive[slot];
    const pose: PoseTarget = { sit: 0, walk: 0, walkPhase: 0, typing: 0, carry: 0, celebrate: 0, reach: 0, wave: 0, t };
    let targetHeading = r.heading;

    const followPath = (onEnd: () => void) => {
      const target = r.path[r.idx];
      if (!target) return onEnd();
      const dx = target[0] - r.pos.x;
      const dz = target[1] - r.pos.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      if (dist <= step) {
        r.pos.set(target[0], 0, target[1]);
        r.idx++;
        if (r.idx >= r.path.length) onEnd();
      } else {
        r.pos.x += (dx / dist) * step;
        r.pos.z += (dz / dist) * step;
        targetHeading = Math.atan2(dx, dz);
      }
      pose.walk = 1;
      pose.walkPhase = t * 9;
    };

    const nearDoor = Math.hypot(r.pos.x - ELEVATOR.x, r.pos.z - ELEVATOR.doorZ) < 1.6 || r.pos.z < ELEVATOR.doorZ;

    switch (r.phase) {
      // ── 入场 ──
      case 'elevator':
        elevatorDoor.requests.add(entry.key);
        R.briefcase.visible = true;
        pose.wave = el > 0.4 ? 1 : 0;
        targetHeading = 0;
        if (el > 1.3) go('walk');
        break;
      case 'walk':
        R.briefcase.visible = true;
        if (nearDoor) elevatorDoor.requests.add(entry.key);
        else elevatorDoor.requests.delete(entry.key);
        followPath(() => go('turn'));
        break;
      case 'turn':
        elevatorDoor.requests.delete(entry.key);
        targetHeading = 0;
        if (el > 0.35) go('sit');
        break;
      case 'sit':
        targetHeading = 0;
        R.briefcase.visible = el < 0.3;
        pose.sit = 1;
        live.itemsScale = Math.min(1, el / 1.1);
        live.screenOn = Math.min(1, el / 0.8);
        if (el > 0.75 && !r.fired) {
          r.fired = true;
          const meta = SKILL_META[c.skill.kind];
          addFx({
            x: DESK_SLOTS[slot].x,
            y: 1.3,
            z: DESK_SLOTS[slot].seatZ + 0.2,
            color: meta.color,
            label: `${meta.icon} 技能激活 · ${meta.describe(c.skill.value)}`,
            sub: `${c.name} 入职 ${slot + 1} 号工位`,
          });
          go('celebrate');
        }
        break;
      case 'celebrate':
        targetHeading = 0;
        pose.sit = el < 1.6 ? 0.3 : 1;
        pose.celebrate = el < 1.6 ? 1 : 0;
        live.itemsScale = 1;
        live.screenOn = 1;
        if (el > 2.2) go('work');
        break;
      case 'work':
        targetHeading = 0;
        pose.sit = 1;
        pose.typing = useGame.getState().projectActive ? 1.0 : Math.sin(t * 0.4) > -0.3 ? 1 : 0;
        live.typing = pose.typing;
        live.itemsScale = 1;
        live.screenOn = 1;
        break;
      // ── 离场 ──
      case 'd-shock':
        targetHeading = 0;
        pose.sit = 1;
        R.head.rotation.z = Math.sin(el * 30) * 0.12 * Math.max(0, 1 - el);
        if (el > 1.3) go('d-stand');
        break;
      case 'd-stand':
        targetHeading = 0;
        pose.sit = 0;
        if (el > 0.8) go('d-pack');
        break;
      case 'd-pack': {
        // 背对相机朝向桌子 → 转身后面向桌子收拾（桌子在 +z 方向）
        targetHeading = 0;
        r.pos.z = THREE.MathUtils.damp(r.pos.z, DESK_SLOTS[slot].deskZ - 0.65, 6, dt);
        pose.reach = el < 2.0 ? 1 : 0;
        pose.carry = el > 2.0 ? 1 : 0;
        R.box.visible = el > 0.25;
        R.box.scale.setScalar(Math.min(1, el / 0.5));
        live.itemsScale = Math.max(0, 1 - el / 1.8);
        live.screenOn = Math.max(0, 1 - el / 2.2);
        live.typing = 0;
        if (el > 2.5) {
          r.path = [[r.pos.x, r.pos.z], ...pathToElevator(slot).slice(1)];
          r.idx = 1;
          go('d-walk');
        }
        break;
      }
      case 'd-walk':
        R.box.visible = true;
        R.box.scale.setScalar(1);
        R.briefcase.visible = false;
        pose.carry = 1;
        live.itemsScale = Math.min(live.itemsScale, Math.max(0, live.itemsScale - dt));
        live.screenOn = Math.max(0, live.screenOn - dt);
        if (nearDoor || r.idx >= r.path.length - 2) elevatorDoor.requests.add(entry.key);
        followPath(() => go('d-enter'));
        if (!r.leftDesk && r.pos.distanceTo(seatPos(slot)) > 2.4) {
          r.leftDesk = true;
          onLeftDesk(entry.key);
        }
        break;
      case 'd-enter':
        pose.carry = 1;
        targetHeading = 0; // 在轿厢内转身面向办公室
        if (el < 1.0) elevatorDoor.requests.add(entry.key);
        else elevatorDoor.requests.delete(entry.key);
        if (!r.leftDesk) {
          r.leftDesk = true;
          onLeftDesk(entry.key);
        }
        if (el > 2.6) onDone(entry.key);
        break;
    }

    // 朝向平滑
    let dh = targetHeading - r.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    r.heading += dh * Math.min(1, dt * 9);
    g.position.copy(r.pos);
    g.rotation.y = r.heading;
    applyPose(R, pose, dt);
  });

  const meta = SKILL_META[c.skill.kind];
  return (
    <group ref={group}>
      <Character ref={rig} look={c.look} scale={ACTOR_SCALE} />
      <Html position={[0, 2.2, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`nametag ${entry.mode === 'depart' ? 'leaving' : ''}`} data-actor={c.id} data-mode={entry.mode} data-phase={phase} data-slot={slot}>
          {bubble && <div className="bubble">{bubble}</div>}
          <div className="tag">
            <span className="tag-skill" style={{ background: meta.color }}>{meta.icon}</span>
            {c.name}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ───────────────────── 老板（玩家本人） ─────────────────────

function Boss({ look, name }: { look: Look; name: string }) {
  const rig = useRef<Rig>(null);
  useFrame((state, dt) => {
    if (!rig.current) return;
    const t = state.clock.elapsedTime;
    const project = useGame.getState().projectActive;
    applyPose(rig.current, { sit: 1, walk: 0, walkPhase: 0, typing: project ? 1 : Math.sin(t * 0.3) > 0 ? 1 : 0, carry: 0, celebrate: 0, reach: 0, wave: 0, t }, Math.min(dt, 0.05));
  });
  return (
    <group position={[BOSS_DESK.x, 0, BOSS_DESK.seatZ - 0.02]}>
      <Character ref={rig} look={look} scale={1.28} />
      <Html position={[0, 2.3, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className="nametag boss">
          <div className="tag">👑 {name}（你）</div>
        </div>
      </Html>
    </group>
  );
}

// ───────────────────── 工位与空位提示 ─────────────────────

function EmptyDeskSign({ slot }: { slot: number }) {
  const marker = useGame((s) => s.poachMarkers[slot]);
  const setMarketOpen = useGame((s) => s.setMarketOpen);
  const [, force] = useState(0);
  useEffect(() => {
    if (!marker) return;
    const id = setTimeout(() => force((x) => x + 1), Math.max(0, marker.until - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [marker]);
  const active = marker && marker.until > Date.now();
  const d = DESK_SLOTS[slot];
  return (
    <Html position={[d.x, 1.75, d.seatZ]} center zIndexRange={[25, 0]}>
      <button className={`empty-desk ${active ? 'poached' : ''}`} onClick={() => setMarketOpen(true)} data-testid={`empty-desk-${slot}`}>
        {active ? (
          <>
            <b>💼 空工位</b>
            <span>
              {marker.name} 被 {marker.buyerName} 挖走
            </span>
            <em>补偿 +{marker.amount} 金币</em>
          </>
        ) : (
          <>
            <b>空工位 {slot + 1}</b>
            <span>点击去人才市场签约</span>
          </>
        )}
      </button>
    </Html>
  );
}

export function TeamArea() {
  const snapshot = useGame((s) => s.snapshot);
  const playerId = snapshot?.me.id ?? null;
  const team = useMemo(() => myTeam(snapshot), [snapshot]);
  const [actors, setActors] = useState<ActorEntry[]>([]);
  const initFor = useRef<string | null>(null);

  // 根据服务端快照差异驱动演出：新增队员 → 电梯入场；失去队员 → 收拾离场（动画结束后才移除）
  useEffect(() => {
    if (!playerId) return;
    const first = initFor.current !== playerId;
    initFor.current = playerId;
    setActors((prev) => {
      const base = first ? [] : prev;
      const next: ActorEntry[] = [];
      const teamIds = new Set(team.map((c) => c.id));
      for (const a of base) {
        if (a.mode !== 'depart' && !teamIds.has(a.colleague.id)) next.push({ ...a, mode: 'depart', leftDesk: false });
        else next.push(a);
      }
      for (const c of team) {
        const existing = next.find((a) => a.colleague.id === c.id && a.mode !== 'depart');
        if (existing) {
          existing.colleague = c;
          continue;
        }
        next.push({ key: `${c.id}#${c.version}`, colleague: c, slot: c.deskSlot ?? 0, mode: first ? 'seated' : 'arrive' });
      }
      return next;
    });
  }, [team, playerId]);

  const onDone = (key: string) => setActors((prev) => prev.filter((a) => a.key !== key));

  const onLeftDesk = (key: string) => setActors((prev) => prev.map((a) => (a.key === key ? { ...a, leftDesk: true } : a)));

  // 被挖走的角色在起身、收拾纸箱、走离工位之前仍算占位；按真实演出进度（而非计时）决定何时显示「空工位 + 补偿」牌
  const occupied = new Set(actors.filter((a) => a.mode !== 'depart' || !a.leftDesk).map((a) => a.slot));
  const avatar = snapshot?.colleagues.find((c) => c.id === snapshot.me.avatarColleagueId);

  return (
    <group>
      {DESK_SLOTS.map((d, i) => (
        <group key={i}>
          <Desk position={[d.x, 0, d.deskZ]} slot={i} accent={SLOT_ACCENTS[i]} />
          <Chair position={[d.x, 0, d.seatZ]} color={['#3c4f7d', '#2f7c7a', '#7a3c5a'][i]} />
          {!occupied.has(i) && snapshot && <EmptyDeskSign slot={i} />}
        </group>
      ))}
      {actors.map((a) => (
        <Actor key={a.key} entry={a} onDone={onDone} onLeftDesk={onLeftDesk} />
      ))}
      {avatar && snapshot && <Boss look={avatar.look} name={snapshot.me.name} />}
      <EmptyDeskReset occupied={occupied} />
    </group>
  );
}

/** 没人的工位：熄屏、清空私人物品 */
function EmptyDeskReset({ occupied }: { occupied: Set<number> }) {
  useFrame((_, dt) => {
    for (let i = 0; i < 3; i++) {
      if (occupied.has(i)) continue;
      const l = deskLive[i];
      const departingHere = [...departingSlots.values()].includes(i);
      if (departingHere) continue;
      l.itemsScale = Math.max(0, l.itemsScale - dt);
      l.screenOn = Math.max(0, l.screenOn - dt);
      l.typing = 0;
    }
  });
  return null;
}
