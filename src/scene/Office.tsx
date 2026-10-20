import { LocalPointLight, LocalLightPool } from './LocalLights.tsx';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { City } from './City.tsx';
import { Room } from './Room.tsx';
import { Campus } from './Campus.tsx';
import { Colleagues } from './Colleagues.tsx';
import { MePlayer, RemotePlayers, walkNear } from './Avatars.tsx';
import { Effects } from './Effects.tsx';
import { FollowCamera } from './FollowCamera.tsx';
import { PALETTE } from './materials.ts';
import { PERF_ENABLED, renderCounters } from '../performance.ts';
import { RenderProbe } from './RenderProbe.tsx';
import { AdaptiveQuality } from './AdaptiveQuality.tsx';
import { BALANCED_LEVELS } from '../renderBudget.ts';
import { QUALITY, useRenderQuality } from '../renderQuality.ts';
import {
  HIGHFIVE_RANGE,
  INTERACT_RANGE,
  PROJECT_TERMINAL,
} from '../../shared/world.ts';
import { rt, useWorld } from '../world/runtime.ts';
import type { Near } from '../world/runtime.ts';
import { useGame } from '../store.ts';

const params = new URLSearchParams(location.search);
/** ?lowfx=1：关闭后期与阴影（低端设备/无 GPU 的录制环境） */
export const LOW_FX = params.get('lowfx') === '1';

/** 主光跟随玩家，保证阴影覆盖当前视野而不需要巨大的阴影贴图 */
function Sun() {
  const light = useRef<THREE.DirectionalLight>(null);
  const gl = useThree(s => s.gl);
  const quality = useRenderQuality(s => s.quality);
  const tier = useRenderQuality(s => s.tier);
  const settings = quality === 'balanced' ? BALANCED_LEVELS[tier] : QUALITY[quality];
  const lastShadow = useRef(-Infinity);
  useEffect(() => {
    const previous = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    const shadow = light.current?.shadow;
    if (shadow?.map) { shadow.map.dispose(); shadow.map = null; }
    gl.shadowMap.needsUpdate = true;
    return () => { gl.shadowMap.autoUpdate = previous; };
  }, [gl, settings.shadow]);
  useFrame(() => {
    // R3F resets its clock when frameloop changes between always/demand.
    // A wall-clock deadline keeps shadows alive after closing an overlay.
    const now = performance.now();
    if (now - lastShadow.current < 1000 / settings.shadowHz) return;
    lastShadow.current = now;
    if (PERF_ENABLED) renderCounters.shadowUpdates++;
    const l = light.current;
    if (!l) return;
    const ov = useWorld.getState().overview;
    const x = ov ? 0 : rt.me.x;
    const z = ov ? 0 : rt.me.z;
    l.position.set(x + 9, 16, z + 8);
    l.target.position.set(x, 0, z);
    l.target.updateMatrixWorld();
    gl.shadowMap.needsUpdate = true;
  });
  return (
    <directionalLight
      ref={light}
      intensity={1.8}
      color="#e2ebff"
      castShadow={!LOW_FX}
      shadow-mapSize={[settings.shadow, settings.shadow]}
      shadow-camera-left={-22}
      shadow-camera-right={22}
      shadow-camera-top={22}
      shadow-camera-bottom={-22}
      shadow-camera-near={1}
      shadow-camera-far={60}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
    />
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#b0baff', '#17223e', 1.25]} />
      <Sun />
      <directionalLight
        position={[-24, 12, -18]}
        intensity={1.1}
        color="#a56dff"
      />
      {[-3.3, 0, 3.3].map((x) => (
        <LocalPointLight
          key={x}
          position={[x, 2.8, -1.6]}
          intensity={7}
          distance={5}
          decay={2}
          color={PALETTE.warmLight}
        />
      ))}
      <LocalPointLight
        position={[4.9, 2.6, 3.2]}
        intensity={6}
        distance={5}
        decay={2}
        color="#ff88d0"
      />
    </>
  );
}

/** 5Hz 计算身边可互动对象（同事 / 在线玩家 / 项目终端） */
function NearScanner() {
  const last = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 200) return;
    last.current = now;
    const snap = useGame.getState().snapshot;
    if (!snap) return;
    const me = rt.me;
    let best: Near | null = null;
    const consider = (n: Near) => {
      if (!best || n.dist < best.dist) best = n;
    };
    for (const c of snap.colleagues) {
      if (c.ownerId === snap.me.id || c.selfPlayerId === snap.me.id) continue;
      const p = rt.colleaguePos.get(c.id);
      if (!p) continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d <= INTERACT_RANGE)
        consider({ kind: 'colleague', id: c.id, dist: d });
    }
    for (const [id, r] of rt.remote) {
      const d = Math.hypot(r.x - me.x, r.z - me.z);
      if (d <= HIGHFIVE_RANGE) consider({ kind: 'player', id, dist: d - 0.5 }); // 玩家优先一点
    }
    const td = Math.hypot(PROJECT_TERMINAL.x - me.x, PROJECT_TERMINAL.z - me.z);
    if (td <= 2.6) consider({ kind: 'terminal', dist: td });
    useWorld.getState().setNear(best);
  });
  return null;
}

/** Opaque overlays own input; keep the world alive at 30 Hz for travel and networking. */
function BackgroundFrames({ covered }: { covered: boolean }) {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    if (!covered) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) invalidate();
    }, 1000 / 30);
    return () => clearInterval(timer);
  }, [covered, invalidate]);
  return null;
}

export function OfficeCanvas({ myId }: { myId: string | null }) {
  const quality = useRenderQuality(s => s.quality);
  const tier = useRenderQuality(s => s.tier);
  const settings = quality === 'balanced' ? BALANCED_LEVELS[tier] : QUALITY[quality];
  const coveredUi = useGame(s => !s.introPlaying && (!!s.drawer || s.phoneOpen || s.projectActive));
  const projectOpen = useWorld(s => s.projectOpen);
  const covered = coveredUi || projectOpen;
  const introPlaying = useGame(s => s.introPlaying);
  const playing = !!myId;
  const onGround = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!playing || e.delta > 6) return;
    const g = useGame.getState();
    if (g.projectActive || g.drawer || g.introPlaying || g.phoneOpen || useWorld.getState().locks.length) return;
    useWorld.getState().setOverview(false);
    walkNear(e.point.x, e.point.z);
  }, [playing]);
  return (
    <Canvas
      className="office-canvas"
      frameloop={covered ? 'demand' : 'always'}
      shadows={LOW_FX ? false : { type: THREE.PCFShadowMap }}
      dpr={LOW_FX ? 1 : [Math.min(1, settings.dpr), settings.dpr]}
      camera={{ position: [34, 34, 46], fov: 38, near: 0.5, far: 600 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.fog = new THREE.Fog('#10142e', 65, 230);
      }}
    >
      <Suspense fallback={null}>
        <BackgroundFrames covered={covered} />
        {!LOW_FX && <AdaptiveQuality paused={covered || introPlaying} />}
        {PERF_ENABLED && <RenderProbe />}
        <Lights />
        <LocalLightPool />
        <Environment resolution={128} frames={1}>
          <Lightformer
            form="rect"
            intensity={2.3}
            color="#e3ecff"
            position={[0, 6, 6]}
            scale={[10, 3, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.8}
            color="#777dff"
            position={[-8, 3, -8]}
            scale={[12, 4, 1]}
          />
        </Environment>
        <City />
        <Campus onGround={onGround} />
        <Room />
        <Colleagues />
        {myId && <MePlayer key={myId} myId={myId} />}
        {myId && <RemotePlayers myId={myId} />}
        {playing && <NearScanner />}
        <Effects />
        <FollowCamera active={playing} />
        {!LOW_FX && (
          <EffectComposer multisampling={settings.multisampling}>
            <Bloom
              mipmapBlur
              luminanceThreshold={1.4}
              luminanceSmoothing={0.3}
              intensity={0.42}
              radius={0.5}
            />
            <Vignette offset={0.3} darkness={0.22} />
          </EffectComposer>
        )}
      </Suspense>
    </Canvas>
  );
}
