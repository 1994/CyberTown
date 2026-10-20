import { LocalPointLight } from './LocalLights.tsx';
import { memo, useMemo, useRef } from 'react';
import { StaticBatch } from './StaticBatch.tsx';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR, WALL_H, ELEVATOR, DESK_SLOTS, BOSS_DESK, MEETING, LOUNGE } from './layout.ts';
import { OFFICE_DOORS } from '../../shared/world.ts';
import { PALETTE, glassMat, glow, partitionGlass, std } from './materials.ts';
import { neonText, rugTexture, woodFloor } from './textures.ts';
import {
  BossDesk,
  Chair,
  CoffeeBar,
  Desk,
  deskLive,
  FloorLamp,
  MeetingArea,
  OfficeCat,
  Plant,
  Printer,
  RoboVac,
  Sofa,
  TallPlant,
  VendingMachine,
  Whiteboard,
} from './Furniture.tsx';

const W = FLOOR.maxX - FLOOR.minX;
const D = FLOOR.maxZ - FLOOR.minZ;

// 总部办公室工位作为开放办公装饰：屏幕常亮、桌面物品就位
for (const l of [0, 1, 2]) {
  deskLive[l] = { itemsScale: 1, screenOn: 1, typing: 0 };
}

/** 电梯门开合：由角色写入的请求驱动（任何需要开门的角色存在时打开） */
export const elevatorDoor = { requests: new Set<string>(), open: 0 };

function Base() {
  const wood = woodFloor();
  return (
    <group>
      {/* 地面边缘灯带（办公室开放边界，人可直接走进走出） */}
      <mesh position={[0, 0.01, D / 2]} material={glow(PALETTE.neonCyan, 1.2)}>
        <boxGeometry args={[W, 0.02, 0.05]} />
      </mesh>
      <mesh position={[W / 2, 0.01, 0]} material={glow(PALETTE.neonCyan, 1.2)}>
        <boxGeometry args={[0.05, 0.02, D]} />
      </mesh>
      {/* 石墨地板 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={wood} roughness={0.48} metalness={0.18} />
      </mesh>
      {/* 电梯厅石材地面 */}
      <mesh rotation-x={-Math.PI / 2} position={[(ELEVATOR.coreMinX + FLOOR.maxX) / 2, 0.006, -3.6]} receiveShadow material={std('#34455f', 0.3, 0.1)}>
        <planeGeometry args={[FLOOR.maxX - ELEVATOR.coreMinX, 2.0]} />
      </mesh>
      {/* 地毯 */}
      <mesh rotation-x={-Math.PI / 2} position={[MEETING.x, 0.008, MEETING.z]} receiveShadow>
        <circleGeometry args={[2.3, 48]} />
        <meshStandardMaterial map={rugTexture()} roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[LOUNGE.x, 0.008, LOUNGE.z + 0.3]} receiveShadow material={std('#3e275d', 0.95)}>
        <planeGeometry args={[3.4, 2.2]} />
      </mesh>
    </group>
  );
}

/** 一段带竖框的玻璃墙（沿 x 或沿 z） */
function GlassRun({ axis, fixed, from, to }: { axis: 'x' | 'z'; fixed: number; from: number; to: number }) {
  const frame = std('#262b36', 0.35, 0.7);
  const len = to - from;
  const mid = (from + to) / 2;
  const n = Math.max(1, Math.round(len / 1.6));
  const pos = (along: number, y: number): [number, number, number] => (axis === 'x' ? [along, y, fixed] : [fixed, y, along]);
  return (
    <group>
      <mesh position={pos(mid, WALL_H / 2)} rotation-y={axis === 'x' ? 0 : Math.PI / 2} material={glassMat}>
        <planeGeometry args={[len, WALL_H]} />
      </mesh>
      {Array.from({ length: n + 1 }, (_, i) => (
        <mesh key={i} position={pos(from + (i * len) / n, WALL_H / 2)} material={frame} castShadow>
          <boxGeometry args={axis === 'x' ? [0.07, WALL_H, 0.1] : [0.1, WALL_H, 0.07]} />
        </mesh>
      ))}
      <mesh position={pos(mid, WALL_H)} material={frame}>
        <boxGeometry args={axis === 'x' ? [len, 0.12, 0.14] : [0.14, 0.12, len]} />
      </mesh>
      <mesh position={pos(mid, 0.06)} material={frame}>
        <boxGeometry args={axis === 'x' ? [len, 0.12, 0.16] : [0.16, 0.12, len]} />
      </mesh>
    </group>
  );
}

/** 玻璃幕墙：后墙与左墙各开一道门（通往人才街 / 咖啡区），门上有发光门楣 */
function GlassWalls() {
  const frame = std('#262b36', 0.35, 0.7);
  const bd = OFFICE_DOORS.back;
  const ld = OFFICE_DOORS.left;
  return (
    <group>
      <GlassRun axis="x" fixed={FLOOR.minZ} from={FLOOR.minX} to={bd.minX} />
      <GlassRun axis="x" fixed={FLOOR.minZ} from={bd.maxX} to={ELEVATOR.coreMinX} />
      <GlassRun axis="z" fixed={FLOOR.minX} from={FLOOR.minZ} to={ld.minZ} />
      <GlassRun axis="z" fixed={FLOOR.minX} from={ld.maxZ} to={FLOOR.maxZ} />
      {/* 门楣 */}
      <mesh position={[(bd.minX + bd.maxX) / 2, WALL_H, FLOOR.minZ]} material={frame}>
        <boxGeometry args={[bd.maxX - bd.minX, 0.12, 0.14]} />
      </mesh>
      <mesh position={[(bd.minX + bd.maxX) / 2, 2.5, FLOOR.minZ]} material={glow(PALETTE.neonCyan, 1.6)}>
        <boxGeometry args={[bd.maxX - bd.minX, 0.05, 0.05]} />
      </mesh>
      <mesh position={[FLOOR.minX, WALL_H, (ld.minZ + ld.maxZ) / 2]} material={frame}>
        <boxGeometry args={[0.14, 0.12, ld.maxZ - ld.minZ]} />
      </mesh>
      <mesh position={[FLOOR.minX, 2.5, (ld.minZ + ld.maxZ) / 2]} material={glow(PALETTE.neonPink, 1.6)}>
        <boxGeometry args={[0.05, 0.05, ld.maxZ - ld.minZ]} />
      </mesh>
      {/* 顶部吊轨灯（暖色） */}
      {[-6.8, -1.5, 1.8].map((x) => (
        <group key={x} position={[x, WALL_H - 0.05, FLOOR.minZ + 0.25]}>
          <mesh material={std('#262b36', 0.4, 0.6)}>
            <boxGeometry args={[0.6, 0.06, 0.12]} />
          </mesh>
          <mesh position={[0, -0.05, 0]} material={glow(PALETTE.warmLight, 2)}>
            <boxGeometry args={[0.5, 0.02, 0.06]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ElevatorCore() {
  const coreW = FLOOR.maxX - ELEVATOR.coreMinX;
  const coreD = ELEVATOR.doorZ - FLOOR.minZ;
  const cx = (ELEVATOR.coreMinX + FLOOR.maxX) / 2;
  const cz = (FLOOR.minZ + ELEVATOR.doorZ) / 2;
  const wall = std(PALETTE.wall, 0.8);
  const accent = std(PALETTE.wallAccent, 0.7);
  const doorMat = std('#637993', 0.3, 0.55);
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const arrow = useRef<THREE.MeshBasicMaterial>(null);
  const cabLight = useRef<THREE.PointLight>(null);
  const DOOR_W = 1.5;
  const sign = neonText([
    { text: '今天老板给我打工', color: '#ff4fb8', size: 104 },
    { text: 'BOSS · WORKS · FOR · ME', color: '#3ef0ff', size: 46 },
  ]);
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(1.9, 1.9, 1.9) }), [sign]);
  useFrame((st, dt) => {
    const want = elevatorDoor.requests.size > 0 ? 1 : 0;
    elevatorDoor.open = THREE.MathUtils.damp(elevatorDoor.open, want, 4.5, dt);
    const o = elevatorDoor.open;
    if (left.current) left.current.position.x = ELEVATOR.x - DOOR_W / 4 - o * (DOOR_W / 2 - 0.02);
    if (right.current) right.current.position.x = ELEVATOR.x + DOOR_W / 4 + o * (DOOR_W / 2 - 0.02);
    if (arrow.current) arrow.current.color.setScalar(want ? 2 + Math.sin(st.clock.elapsedTime * 10) : 0.6);
    if (cabLight.current) cabLight.current.intensity = 2 + o * 8;
    signMat.color.setScalar(1.7 + Math.sin(st.clock.elapsedTime * 2.1) * 0.12 + (Math.random() > 0.995 ? -0.8 : 0));
  });
  const doorFrontZ = ELEVATOR.doorZ;
  return (
    <group>
      {/* 核心筒墙体（门洞两侧 + 门楣） */}
      <mesh position={[(ELEVATOR.coreMinX + ELEVATOR.x - DOOR_W / 2) / 2, WALL_H / 2, cz]} material={wall} castShadow receiveShadow>
        <boxGeometry args={[ELEVATOR.x - DOOR_W / 2 - ELEVATOR.coreMinX, WALL_H, coreD]} />
      </mesh>
      <mesh position={[(ELEVATOR.x + DOOR_W / 2 + FLOOR.maxX) / 2, WALL_H / 2, cz]} material={wall} castShadow receiveShadow>
        <boxGeometry args={[FLOOR.maxX - ELEVATOR.x - DOOR_W / 2, WALL_H, coreD]} />
      </mesh>
      <mesh position={[ELEVATOR.x, (2.3 + WALL_H) / 2, cz]} material={wall} castShadow>
        <boxGeometry args={[DOOR_W, WALL_H - 2.3, coreD]} />
      </mesh>
      {/* 木饰面 + 强调色 */}
      {[{ min: ELEVATOR.coreMinX, max: ELEVATOR.x - DOOR_W / 2 },
        { min: ELEVATOR.x + DOOR_W / 2, max: FLOOR.maxX }].map(({ min, max }) => (
        <mesh key={min} position={[(min + max) / 2, 0.6, doorFrontZ + 0.01]} material={std(PALETTE.walnut, 0.5)}>
          <boxGeometry args={[max - min, 1.2, 0.02]} />
        </mesh>
      ))}
      <mesh position={[ELEVATOR.coreMinX + 0.02, WALL_H / 2, cz]} material={accent}>
        <boxGeometry args={[0.04, WALL_H, coreD]} />
      </mesh>
      {/* 轿厢内部（开门可见） */}
      <mesh position={[ELEVATOR.x, 1.15, FLOOR.minZ + 0.06]} material={std('#34415d', 0.3, 0.6)}>
        <boxGeometry args={[DOOR_W, 2.3, 0.05]} />
      </mesh>
      <mesh position={[ELEVATOR.x, 0.01, cz]} rotation-x={-Math.PI / 2} material={std('#111a31', 0.4)}>
        <planeGeometry args={[DOOR_W, coreD]} />
      </mesh>
      <LocalPointLight ref={cabLight} position={[ELEVATOR.x, 2.1, cz]} color="#b8e7ff" intensity={2} distance={3} decay={2} />
      {/* 门框 */}
      <mesh position={[ELEVATOR.x, 2.33, doorFrontZ + 0.04]} material={std('#9aa3b2', 0.25, 0.9)}>
        <boxGeometry args={[DOOR_W + 0.24, 0.08, 0.1]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[ELEVATOR.x + s * (DOOR_W / 2 + 0.08), 1.15, doorFrontZ + 0.04]} material={std('#9aa3b2', 0.25, 0.9)}>
          <boxGeometry args={[0.08, 2.3, 0.1]} />
        </mesh>
      ))}
      {/* 滑动门 */}
      <mesh ref={left} position={[ELEVATOR.x - DOOR_W / 4, 1.15, doorFrontZ - 0.02]} material={doorMat} castShadow>
        <boxGeometry args={[DOOR_W / 2, 2.28, 0.04]} />
      </mesh>
      <mesh ref={right} position={[ELEVATOR.x + DOOR_W / 4, 1.15, doorFrontZ - 0.02]} material={doorMat} castShadow>
        <boxGeometry args={[DOOR_W / 2, 2.28, 0.04]} />
      </mesh>
      {/* 楼层指示 */}
      <mesh position={[ELEVATOR.x, 2.52, doorFrontZ + 0.02]}>
        <planeGeometry args={[0.18, 0.18]} />
        <meshBasicMaterial ref={arrow} color="#7dffa8" toneMapped={false} />
      </mesh>
      <mesh position={[ELEVATOR.x + DOOR_W / 2 + 0.3, 1.1, doorFrontZ + 0.02]} material={glow('#ffd166', 1.6)}>
        <circleGeometry args={[0.05, 16]} />
      </mesh>
      {/* 霓虹品牌招牌 */}
      <mesh position={[cx, 2.85, doorFrontZ + 0.03]} material={signMat}>
        <planeGeometry args={[coreW - 0.3, (coreW - 0.3) / 4]} />
      </mesh>
      <LocalPointLight position={[cx, 2.7, doorFrontZ + 0.8]} color={PALETTE.neonPink} intensity={6} distance={5} decay={2} />
    </group>
  );
}

function MeetingPartition() {
  const frame = std('#262b36', 0.35, 0.7);
  const x0 = MEETING.x + 2.6;
  return (
    <group>
      <mesh position={[x0, 1.05, MEETING.z + 0.1]} rotation-y={Math.PI / 2} material={partitionGlass}>
        <planeGeometry args={[4.2, 2.1]} />
      </mesh>
      <mesh position={[x0, 2.1, MEETING.z + 0.1]} material={frame}>
        <boxGeometry args={[0.06, 0.06, 4.2]} />
      </mesh>
      {[-2.1, 2.1].map((dz) => (
        <mesh key={dz} position={[x0, 1.05, MEETING.z + 0.1 + dz]} material={frame}>
          <boxGeometry args={[0.06, 2.1, 0.06]} />
        </mesh>
      ))}
      <mesh position={[x0 + 0.01, 1.35, MEETING.z + 0.1]} rotation-y={Math.PI / 2} material={glow(PALETTE.neonCyan, 1.5)}>
        <planeGeometry args={[3.6, 0.03]} />
      </mesh>
    </group>
  );
}

export const Room = memo(function Room() {
  return (
    <group>
      <StaticBatch worldStatic>
        <Base />
        <GlassWalls />
        <MeetingArea position={[MEETING.x, 0, MEETING.z]} />
        <MeetingPartition />
        <Whiteboard position={[FLOOR.minX + 0.2, 0, MEETING.z]} rotation={Math.PI / 2} />
        <Sofa position={[LOUNGE.x, 0, LOUNGE.z]} color={PALETTE.fabricTeal} />
        <mesh position={[LOUNGE.x, 0.22, LOUNGE.z + 1.05]} material={std(PALETTE.oak, 0.4)} castShadow receiveShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.06, 32]} />
        </mesh>
        <mesh position={[LOUNGE.x, 0.1, LOUNGE.z + 1.05]} material={std(PALETTE.metal, 0.4, 0.6)}>
          <cylinderGeometry args={[0.04, 0.2, 0.2, 12]} />
        </mesh>
        <FloorLamp position={[LOUNGE.x - 1.6, 0, LOUNGE.z - 0.3]} />
        <FloorLamp position={[BOSS_DESK.x + 1.9, 0, BOSS_DESK.z - 1.0]} />
        <BossDesk position={[BOSS_DESK.x, 0, BOSS_DESK.z]} />
        <Chair position={[BOSS_DESK.x, 0, BOSS_DESK.seatZ]} rotation={0} exec color="#3a2a2a" />
        <CoffeeBar position={[FLOOR.maxX - 0.45, 0, -0.9]} rotation={-Math.PI / 2} />
        <VendingMachine position={[FLOOR.maxX - 0.5, 0, 0.9]} rotation={-Math.PI / 2} />
        <Printer position={[-0.6, 0, 4.9]} rotation={Math.PI} />
        <TallPlant position={[FLOOR.minX + 0.6, 0, FLOOR.minZ + 0.6]} seed={4} />
        <TallPlant position={[FLOOR.minX + 0.6, 0, FLOOR.maxZ - 0.6]} seed={8} />
        <TallPlant position={[ELEVATOR.coreMinX - 0.55, 0, FLOOR.minZ + 0.55]} seed={12} />
        <TallPlant position={[FLOOR.maxX - 0.6, 0, FLOOR.maxZ - 0.6]} seed={16} />
        <Plant position={[(DESK_SLOTS[0].x + DESK_SLOTS[1].x) / 2, 0, DESK_SLOTS[0].deskZ + 0.1]} seed={30} scale={0.9} />
        <Plant position={[(DESK_SLOTS[1].x + DESK_SLOTS[2].x) / 2, 0, DESK_SLOTS[0].deskZ + 0.1]} seed={31} scale={0.9} />
        <Plant position={[1.6, 0, 4.9]} seed={32} pot={PALETTE.terracotta} />
        <Plant position={[-2.6, 0, FLOOR.minZ + 0.45]} seed={33} />
      </StaticBatch>
      <ElevatorCore />
      <OfficeCat position={[LOUNGE.x + 0.55, 0.5, LOUNGE.z + 0.05]} />
      <RoboVac />
      {DESK_SLOTS.map((d, i) => (
        <group key={i}>
          <Desk position={[d.x, 0, d.deskZ]} slot={i} accent={['#3ef0ff', '#ffd166', '#ff4fb8'][i]} />
          <Chair position={[d.x, 0, d.seatZ]} color={['#3c4f7d', '#2f7c7a', '#7a3c5a'][i]} />
        </group>
      ))}
    </group>
  );
});
