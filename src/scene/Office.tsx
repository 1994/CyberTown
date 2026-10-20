import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { City } from './City.tsx';
import { Room } from './Room.tsx';
import { TeamArea } from './Actors.tsx';
import { Effects } from './Effects.tsx';
import { CameraRig } from './CameraRig.tsx';
import { DEFAULT_CAM } from './layout.ts';
import { PALETTE } from './materials.ts';

const params = new URLSearchParams(location.search);
/** ?lowfx=1：关闭后期与阴影（低端设备/无 GPU 的录制环境） */
export const LOW_FX = params.get('lowfx') === '1';

function Lights() {
  return (
    <>
      <hemisphereLight args={['#7f8cff', '#3a2618', 0.75]} />
      {/* 室内主光：暖色，投射阴影 */}
      <directionalLight
        position={[9, 14, 8]}
        intensity={2.1}
        color="#ffe0b8"
        castShadow={!LOW_FX}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* 窗外月光：冷色轮廓 */}
      <directionalLight position={[-14, 9, -12]} intensity={1.2} color="#8fb4ff" />
      {/* 工位暖色吊灯 */}
      {[-3.3, 0, 3.3].map((x) => (
        <pointLight key={x} position={[x, 2.8, -1.6]} intensity={7} distance={5} decay={2} color={PALETTE.warmLight} />
      ))}
      <pointLight position={[-6.5, 2.2, 4.8]} intensity={5} distance={6} decay={2} color={PALETTE.neonCyan} />
      <pointLight position={[4.9, 2.6, 3.2]} intensity={6} distance={5} decay={2} color="#ffc47a" />
    </>
  );
}

export function OfficeCanvas({ cinematic = true }: { cinematic?: boolean }) {
  return (
    <Canvas
      className="office-canvas"
      shadows={LOW_FX ? false : { type: THREE.PCFShadowMap }}
      dpr={LOW_FX ? 1 : [1, 1.75]}
      camera={{ position: DEFAULT_CAM.pos, fov: 32, near: 0.1, far: 900 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.18;
        scene.fog = new THREE.Fog('#151a36', 55, 300);
      }}
    >
      <Suspense fallback={null}>
        <Lights />
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={3} color="#ffd6a8" position={[0, 6, 6]} scale={[10, 3, 1]} />
          <Lightformer form="rect" intensity={2.5} color="#6f8dff" position={[-8, 3, -8]} scale={[12, 4, 1]} />
          <Lightformer form="ring" intensity={4} color={PALETTE.neonPink} position={[6, 3, -6]} scale={2} />
        </Environment>
        <City />
        <Room />
        <TeamArea />
        <Effects />
        <CameraRig cinematic={cinematic} />
        {!LOW_FX && (
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={0.85} radius={0.7} />
            <Vignette offset={0.3} darkness={0.55} />
          </EffectComposer>
        )}
      </Suspense>
    </Canvas>
  );
}
