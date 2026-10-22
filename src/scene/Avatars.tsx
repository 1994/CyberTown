import { useRide } from '../tea/rideState';
import { Bicycle } from './Bicycle';
import { RIDE_SPEED } from '../../shared/townActivities';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { WorldLabel } from './WorldLabel.tsx';
import * as THREE from 'three';
import type { HighfiveEvent, Look } from '../../shared/types.ts';
import {
  WALK_SPEED,
  moveWithCollision,
  clampToBounds,
} from '../../shared/world.ts';
import { useGame } from '../store.ts';
import { rt, pushTrail, useWorld, worldNow } from '../world/runtime.ts';
import { inputVector, movementLocked } from '../world/input.ts';
import { Character } from './Character.tsx';
import type { Rig } from './Character.tsx';
import { applyPose, idlePose, turnTowards } from './pose.ts';
import { useFx } from './Effects.tsx';
import { socialEntry } from '../world/selectors.ts';
import type { SocialEntry } from '../world/selectors.ts';
import { dressed } from '../look.ts';
import { goToPlayer } from '../world/navigation.ts';
import { selectCrowd } from '../../shared/proximity.ts';
import { Crowd } from './Crowd.tsx';
import { renderCounters } from '../performance.ts';
import { useTouchUi } from '../ui/useTouchUi.ts';
import { updateNpcNavigation } from '../world/navigation.ts';
export { walkNear } from '../world/navigation.ts';

const PLAYER_SCALE = 1.25;
const EMOTE_ICON: Record<string, string> = {
  wave: '👋',
  dance: '💃',
  coffee: '☕',
};

/** 远端/本地玩家的外观：使用该测试身份的分身外观，保证一眼认出是谁 */
function useLookOf(id: string): {
  look: Look | null;
  name: string;
  color: string;
  rankName: string;
  aura: string;
} {
  const snapshot = useGame((s) => s.snapshot);
  return useMemo(() => {
    const p = snapshot?.players.find((x) => x.id === id);
    const av = snapshot?.colleagues.find((c) => c.id === p?.avatarColleagueId);
    return {
      look: av ? dressed(av.look, p?.style) : null,
      name: p?.name ?? id,
      color: p?.color ?? '#ffffff',
      rankName: p?.rankName ?? '',
      aura: p?.style?.aura ?? '',
    };
  }, [snapshot, id]);
}

// Position interpolation lives in rt; only social changes need a React render.
function useWorldEntry(id: string): SocialEntry | undefined {
  return useWorld(useShallow((s) => socialEntry(s.players, id)));
}

/** 碰杯庆祝：双方举杯跳一下（本地 1.6 秒） */
const cheersUntil = new Map<string, number>();

function emotePose(
  rig: Rig,
  entry: SocialEntry | undefined,
  moving: boolean,
  phase: number,
  t: number,
  dt: number,
  id: string,
) {
  const pose = idlePose(t);
  const now = worldNow();
  const emote = entry && entry.emoteUntil > now ? entry.emote : '';
  if (moving) {
    pose.walk = 1;
    pose.walkPhase = phase;
  }
  if (!moving) {
    if (emote === 'wave') pose.wave = 1;
    if (emote === 'dance') pose.dance = 1;
    if (emote === 'coffee') pose.cup = 1;
  }
  if ((cheersUntil.get(id) ?? 0) > performance.now()) {
    pose.cup = 1;
    pose.celebrate = moving ? 0 : 0.6;
  }
  applyPose(rig, pose, dt);
}

function Bubble({
  entry,
  name,
  you,
  color,
  rankName: _rankName,
}: {
  entry: SocialEntry | undefined;
  name: string;
  you?: boolean;
  color: string;
  rankName: string;
}) {
  const overview = useWorld((s) => s.overview);
  const now = worldNow();
  const said = entry && entry.saidUntil > now ? entry.said : '';
  const emote = entry && entry.emoteUntil > now ? entry.emote : '';
  // 让过期气泡消失：到期时刷新一次
  const until = Math.max(entry?.saidUntil ?? 0, entry?.emoteUntil ?? 0);
  const [, force] = useStateTick();
  useEffect(() => {
    if (until <= now) return;
    const id = setTimeout(force, until - now + 50);
    return () => clearTimeout(id);
  }, [until, now, force]);
  return (
    <div
      className={`ptag ${you ? 'you' : ''} ${overview ? 'overview-hidden' : ''}`}
      style={{ ['--pc' as string]: color }}
      data-player={entry?.id}
    >
      {said && <div className="bubble">{said}</div>}
      {emote && <div className="emote-pop">{EMOTE_ICON[emote] ?? ''}</div>}
      {you ? <div className="self-location" data-testid="world-self-marker" aria-label={`${name}，你的位置`}>◆ 你<span aria-hidden>▾</span></div> : <div className="pname">{name}</div>}
    </div>
  );
}

function useStateTick(): [number, () => void] {
  const [n, set] = useState(0);
  return [n, useCallback(() => set((x) => x + 1), [])];
}

export function FootRing({ color, you }: { color: string; you?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(you ? 1.25 : 1),
        transparent: true,
        opacity: 0.8,
        toneMapped: false,
        depthWrite: false,
      }),
    [color, you],
  );
  useFrame(({ clock }) => {
    if (ref.current && you)
      ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.06);
  });
  return (
    <mesh
      ref={ref}
      rotation-x={-Math.PI / 2}
      position={[0, 0.02, 0]}
      material={mat}
    >
      <ringGeometry args={[you ? 0.55 : 0.5, you ? 0.7 : 0.6, 40]} />
    </mesh>
  );
}

// ───────────────────── 自己（可操控） ─────────────────────

export function MePlayer({ myId }: { myId: string }) {
  const riding=useRide(s=>s.riding), bikeColor=useRide(s=>s.color);
  const { look, name, rankName, aura } = useLookOf(myId);
  const entry = useWorldEntry(myId);
  const group = useRef<THREE.Group>(null);
  const rig = useRef<Rig>(null);
  const phase = useRef(0);
  const marker = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id !== myId) return;
      cheersUntil.set(id, performance.now() + 2600);
      useFx.getState().add({
        x: rt.me.x,
        y: 1.5,
        z: rt.me.z,
        color: '#dfb34c',
        label: '今天你最大',
        sub: '今日份快乐，已签收',
      });
    };
    window.addEventListener('world-celebrate', on);
    return () => window.removeEventListener('world-celebrate', on);
  }, [myId]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const me = rt.me;
    const speed = riding ? RIDE_SPEED : WALK_SPEED;
    let vx = 0;
    let vz = 0;
    const { right, fwd } = inputVector();
    // 弹窗、聊天输入、抽屉、小游戏期间：键盘/摇杆/自动寻路全部停止
    if (movementLocked()) { rt.path = null; rt.npcNavigation = null; }
    updateNpcNavigation(performance.now());
    if (right || fwd) {
      rt.npcNavigation = null;
      // 相机坐标系 → 世界坐标：前 = 从相机指向目标的水平方向
      const yaw = rt.camYaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      vx = (fx * fwd + -fz * right) * speed;
      vz = (fz * fwd + fx * right) * speed;
      rt.path = null;
    } else if (rt.path && rt.path.length) {
      const [tx, tz] = rt.path[0];
      const dx = tx - me.x;
      const dz = tz - me.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) {
        rt.path.shift();
        if (!rt.path.length) rt.path = null;
      } else {
        const sp = Math.min(speed, d / dt);
        vx = (dx / d) * sp;
        vz = (dz / d) * sp;
      }
    }
    if (rt.correction) {
      // 服务端拒绝 → 平滑拉回权威位置
      me.x = THREE.MathUtils.damp(me.x, rt.correction.x, 8, dt);
      me.z = THREE.MathUtils.damp(me.z, rt.correction.z, 8, dt);
      if (Math.hypot(me.x - rt.correction.x, me.z - rt.correction.z) < 0.05)
        rt.correction = null;
      vx = vz = 0;
    }
    const moving = Math.hypot(vx, vz) > 0.05;
    if (moving) {
      const [nx, nz] = moveWithCollision(me.x, me.z, vx * dt, vz * dt);
      [me.x, me.z] = clampToBounds(nx, nz);
      me.yaw = turnTowards(me.yaw, Math.atan2(vx, vz), dt, 12);
      phase.current += dt * 10;
    }
    me.moving = moving;
    pushTrail(myId, me.x, me.z);
    if (group.current) {
      group.current.position.set(me.x, 0, me.z);
      group.current.rotation.y = me.yaw;
    }
    if (rig.current)
      emotePose(
        rig.current,
        entry,
        moving,
        phase.current,
        state.clock.elapsedTime,
        dt,
        myId,
      );
    if (riding && rig.current) {
      const r=rig.current;
      r.body.position.y=.5;
      r.torso.rotation.x=.15;
      r.legL.rotation.x=-.75+(moving?Math.sin(phase.current)*.35:0);
      r.legR.rotation.x=-.75-(moving?Math.sin(phase.current)*.35:0);
      r.armL.rotation.x=r.armR.rotation.x=-.95;
      r.armL.rotation.z=r.armR.rotation.z=0;
    } else if (rig.current) rig.current.torso.rotation.x=0;
    // 寻路终点标记
    if (marker.current) {
      const end = rt.path?.[rt.path.length - 1];
      marker.current.visible = !!end;
      if (end) {
        marker.current.position.set(end[0], 0.03, end[1]);
        marker.current.scale.setScalar(
          1 + Math.sin(state.clock.elapsedTime * 6) * 0.1,
        );
      }
    }
  });

  if (!look) return null;
  return (
    <>
      <group ref={group} name="me">
        <FootRing color={aura || '#d7af51'} you />
        <Character ref={rig} look={look} scale={PLAYER_SCALE} />
        {riding && <Bicycle color={bikeColor} riding/>}
        <WorldLabel
          position={[0, 2.45, 0]}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <Bubble
            entry={entry}
            name={name}
            you
            color="#e3bf6d"
            rankName={rankName}
          />
        </WorldLabel>
      </group>
      <mesh ref={marker} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.3, 0.42, 32]} />
        <meshBasicMaterial
          color={new THREE.Color('#ffd166').multiplyScalar(2)}
          toneMapped={false}
          transparent
          opacity={0.85}
        />
      </mesh>
    </>
  );
}

// ───────────────────── 远端玩家（插值） ─────────────────────

function RemotePlayer({ id }: { id: string }) {
  const { look, name, color, rankName, aura } = useLookOf(id);
  const entry = useWorldEntry(id);
  const group = useRef<THREE.Group>(null);
  const rig = useRef<Rig>(null);
  const phase = useRef(0);
  const fade = useRef(.75);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const r = rt.remote.get(id);
    if (!r || !group.current) return;
    const dist = Math.hypot(r.tx - r.x, r.tz - r.z);
    if (dist > 10) {
      r.x = r.tx;
      r.z = r.tz;
    } else {
      // 以接近步行速度追随目标，避免 5Hz 更新造成的顿挫
      const step = Math.min(dist, Math.max(WALK_SPEED * 1.15, dist * 4) * dt);
      if (dist > 0.001) {
        r.x += ((r.tx - r.x) / dist) * step;
        r.z += ((r.tz - r.z) / dist) * step;
      }
    }
    const moving =
      dist > 0.08 || (r.tmoving && performance.now() - r.seenAt < 600);
    r.moving = moving;
    const targetYaw = dist > 0.08 ? Math.atan2(r.tx - r.x, r.tz - r.z) : r.tyaw;
    r.yaw = turnTowards(r.yaw, targetYaw, dt, 10);
    if (moving) phase.current += dt * 10;
    pushTrail(id, r.x, r.z);
    group.current.position.set(r.x, 0, r.z);
    fade.current = THREE.MathUtils.damp(fade.current, 1, 10, dt);
    group.current.scale.setScalar(fade.current);
    group.current.rotation.y = r.yaw;
    if (rig.current)
      emotePose(
        rig.current,
        entry,
        moving,
        phase.current,
        state.clock.elapsedTime,
        dt,
        id,
      );
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return;
    const r = rt.remote.get(id);
    if (!r) return;
    useWorld.getState().setFocus(id);
    void goToPlayer(id).catch(() => undefined);
  };

  if (!look) return null;
  return (
    <group ref={group} onClick={onClick}>
      <FootRing color={aura || color} />
      <Character ref={rig} look={look} scale={PLAYER_SCALE} />
      <WorldLabel
        position={[0, 2.45, 0]}
        center
        zIndexRange={[20, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <Bubble entry={entry} name={name} color={color} rankName={rankName} />
      </WorldLabel>
    </group>
  );
}

export function RemotePlayers({ myId }: { myId: string }) {
  const compact = useTouchUi();
  const [selection, setSelection] = useState<{ full: string[]; lite: string[] }>({ full: [], lite: [] });
  const previous = useRef(selection);
  useEffect(() => {
    const update = () => {
      const world = useWorld.getState();
      const next = selectCrowd(world.players, rt.me, myId, previous.current, compact, world.focusId);
      renderCounters.crowdFull = next.full.length;
      renderCounters.crowdLite = next.lite.length;
      if (next.full.join('|') !== previous.current.full.join('|') || next.lite.join('|') !== previous.current.lite.join('|')) {
        previous.current = next;
        useWorld.setState({ fullPlayerIds: next.full });
        setSelection(next);
      }
    };
    update(); const timer = setInterval(update, 200);
    return () => { clearInterval(timer); renderCounters.crowdFull = 0; renderCounters.crowdLite = 0; };
  }, [myId, compact]);
  const addFx = useFx((s) => s.add);
  // 碰杯：双方举杯 + 彩纸
  useEffect(() => {
    const on = (ev: Event) => {
      const e = (ev as CustomEvent<HighfiveEvent>).detail;
      const a = e.playerId === myId ? rt.me : rt.remote.get(e.playerId);
      const b = e.targetId === myId ? rt.me : rt.remote.get(e.targetId);
      const until = performance.now() + 1600;
      cheersUntil.set(e.playerId, until);
      cheersUntil.set(e.targetId, until);
      if (a && b)
        addFx({
          x: (a.x + b.x) / 2,
          y: 1.6,
          z: (a.z + b.z) / 2,
          color: '#ffd166',
          label: `🥂 碰杯 +${e.reward}`,
        });
    };
    window.addEventListener('world-highfive', on);
    return () => window.removeEventListener('world-highfive', on);
  }, [myId, addFx]);
  return (
    <>
      {selection.full.map((id) => <RemotePlayer key={id} id={id} />)}
      <Crowd ids={selection.lite} />
    </>
  );
}
