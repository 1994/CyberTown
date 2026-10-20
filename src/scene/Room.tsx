import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { FLOOR, WALL_H, ELEVATOR, DESK_SLOTS, BOSS_DESK, MEETING, LOUNGE } from './layout.ts';
import { PALETTE, glassMat, glow, partitionGlass, std } from './materials.ts';
import { neonText, rugTexture, woodFloor } from './textures.ts';
import {
  BossDesk,
  Chair,
  CoffeeBar,
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

/** 电梯门开合：由角色写入的请求驱动（任何需要开门的角色存在时打开） */
export const elevatorDoor = { requests: new Set<string>(), open: 0 };

function Base() {
  const wood = woodFloor();
  return (
    <group>
      {/* 微缩模型底座 */}
      <RoundedBox args={[W + 0.6, 0.9, D + 0.6]} radius={0.12} position={[0, -0.47, 0]} material={std(PALETTE.base, 0.55, 0.2)} receiveShadow />
      {/* 底座发光灯带 */}
      <mesh position={[0, -0.5, D / 2 + 0.31]} material={glow(PALETTE.neonCyan, 1.4)}>
        <boxGeometry args={[W + 0.4, 0.04, 0.02]} />
      </mesh>
      <mesh position={[W / 2 + 0.31, -0.5, 0]} material={glow(PALETTE.neonCyan, 1.4)}>
        <boxGeometry args={[0.02, 0.04, D + 0.4]} />
      </mesh>
      {/* 木地板 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={wood} roughness={0.55} metalness={0.02} />
      </mesh>
      {/* 电梯厅石材地面 */}
      <mesh rotation-x={-Math.PI / 2} position={[(ELEVATOR.coreMinX + FLOOR.maxX) / 2, 0.006, -3.6]} receiveShadow material={std('#c9c3bb', 0.3, 0.1)}>
        <planeGeometry args={[FLOOR.maxX - ELEVATOR.coreMinX, 2.0]} />
      </mesh>
      {/* 地毯 */}
      <mesh rotation-x={-Math.PI / 2} position={[MEETING.x, 0.008, MEETING.z]} receiveShadow>
        <circleGeometry args={[2.3, 48]} />
        <meshStandardMaterial map={rugTexture()} roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[LOUNGE.x, 0.008, LOUNGE.z + 0.3]} receiveShadow material={std('#e3b23c', 0.95)}>
        <planeGeometry args={[3.4, 2.2]} />
      </mesh>
    </group>
  );
}

function GlassWalls() {
  const frame = std('#262b36', 0.35, 0.7);
  const backLen = ELEVATOR.coreMinX - FLOOR.minX;
  const mullionsBack = Math.round(backLen / 1.6);
  const mullionsLeft = Math.round(D / 1.6);
  return (
    <group>
      {/* 后墙玻璃（-z） */}
      <mesh position={[FLOOR.minX + backLen / 2, WALL_H / 2, FLOOR.minZ]} material={glassMat}>
        <planeGeometry args={[backLen, WALL_H]} />
      </mesh>
      {Array.from({ length: mullionsBack + 1 }, (_, i) => (
        <mesh key={'b' + i} position={[FLOOR.minX + (i * backLen) / mullionsBack, WALL_H / 2, FLOOR.minZ]} material={frame} castShadow>
          <boxGeometry args={[0.07, WALL_H, 0.1]} />
        </mesh>
      ))}
      {/* 左墙玻璃（-x） */}
      <mesh position={[FLOOR.minX, WALL_H / 2, 0]} rotation-y={Math.PI / 2} material={glassMat}>
        <planeGeometry args={[D, WALL_H]} />
      </mesh>
      {Array.from({ length: mullionsLeft + 1 }, (_, i) => (
        <mesh key={'l' + i} position={[FLOOR.minX, WALL_H / 2, FLOOR.minZ + (i * D) / mullionsLeft]} material={frame} castShadow>
          <boxGeometry args={[0.1, WALL_H, 0.07]} />
        </mesh>
      ))}
      {/* 顶梁 + 窗台 */}
      <mesh position={[FLOOR.minX + backLen / 2, WALL_H, FLOOR.minZ]} material={frame}>
        <boxGeometry args={[backLen, 0.12, 0.14]} />
      </mesh>
      <mesh position={[FLOOR.minX, WALL_H, 0]} material={frame}>
        <boxGeometry args={[0.14, 0.12, D]} />
      </mesh>
      <mesh position={[FLOOR.minX + backLen / 2, 0.06, FLOOR.minZ + 0.05]} material={frame}>
        <boxGeometry args={[backLen, 0.12, 0.16]} />
      </mesh>
      <mesh position={[FLOOR.minX + 0.05, 0.06, 0]} material={frame}>
        <boxGeometry args={[0.16, 0.12, D]} />
      </mesh>
      {/* 顶部吊轨灯（暖色） */}
      {[-6, -2.5, 1].map((x) => (
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
  const doorMat = std('#d4d9e2', 0.3, 0.55);
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const arrow = useRef<THREE.MeshBasicMaterial>(null);
  const cabLight = useRef<THREE.PointLight>(null);
  const DOOR_W = 1.5;
  const sign = neonText([
    { text: '今天老板给我打工', color: PALETTE.neonPink, size: 104 },
    { text: 'BOSS · WORKS · FOR · ME', color: PALETTE.neonCyan, size: 46 },
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
      <mesh position={[cx, 0.6, doorFrontZ + 0.01]} material={std(PALETTE.walnut, 0.5)}>
        <boxGeometry args={[coreW, 1.2, 0.02]} />
      </mesh>
      <mesh position={[ELEVATOR.coreMinX + 0.02, WALL_H / 2, cz]} material={accent}>
        <boxGeometry args={[0.04, WALL_H, coreD]} />
      </mesh>
      {/* 轿厢内部（开门可见） */}
      <mesh position={[ELEVATOR.x, 1.15, FLOOR.minZ + 0.06]} material={std('#e9d7b8', 0.3, 0.6)}>
        <boxGeometry args={[DOOR_W, 2.3, 0.05]} />
      </mesh>
      <mesh position={[ELEVATOR.x, 0.01, cz]} rotation-x={-Math.PI / 2} material={std('#3a3530', 0.4)}>
        <planeGeometry args={[DOOR_W, coreD]} />
      </mesh>
      <pointLight ref={cabLight} position={[ELEVATOR.x, 2.1, cz]} color="#ffe2b0" intensity={2} distance={3} decay={2} />
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
      <pointLight position={[cx, 2.7, doorFrontZ + 0.8]} color={PALETTE.neonPink} intensity={6} distance={5} decay={2} />
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

export function Room() {
  return (
    <group>
      <Base />
      <GlassWalls />
      <ElevatorCore />
      <MeetingArea position={[MEETING.x, 0, MEETING.z]} />
      <MeetingPartition />
      <Whiteboard position={[FLOOR.minX + 0.2, 0, MEETING.z]} rotation={Math.PI / 2} />
      <Sofa position={[LOUNGE.x, 0, LOUNGE.z]} color={PALETTE.fabricTeal} />
      <OfficeCat position={[LOUNGE.x + 0.55, 0.5, LOUNGE.z + 0.05]} />
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
      <RoboVac />
    </group>
  );
}
