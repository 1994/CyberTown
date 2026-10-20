import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { Look } from '../../shared/types.ts';
import { Character } from './Character.tsx';
import type { Rig } from './Character.tsx';
import { applyPose, idlePose } from './pose.ts';

function Model({ look, wave }: { look: Look; wave: boolean }) {
  const ref = useRef<Rig>(null);
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    const p = idlePose(clock.elapsedTime);
    p.wave = wave ? 1 : Math.sin(clock.elapsedTime * 0.8) > 0.8 ? 0.8 : 0;
    applyPose(ref.current, p, Math.min(dt, 0.05));
  });
  return <Character ref={ref} look={look} scale={1.4} />;
}

/** The same game rig, materials and outfits as the actual world, not a static mock. */
export function Portrait({
  look,
  aura,
  wave = false,
}: {
  look: Look;
  aura?: string;
  wave?: boolean;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [2.4, 2.1, 4], fov: 33 }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera }) => camera.lookAt(0, 0.95, 0)}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={1.8} />
        <hemisphereLight args={['#ecf4ff', '#28314d', 1.3]} />
        <directionalLight position={[4, 6, 5]} intensity={3} color="#fff0e9" />
        <directionalLight position={[-3, 3, -3]} intensity={2} color="#69e9ff" />
        <mesh position={[0, -0.055, 0]} receiveShadow>
          <cylinderGeometry args={[0.83, 0.9, 0.1, 48]} />
          <meshStandardMaterial color="#25304e" metalness={0.4} roughness={0.45}/>
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]}>
          <ringGeometry args={[0.72, 0.75, 64]}/>
          <meshBasicMaterial color="#66f4ff" transparent opacity={0.8}/>
        </mesh>
        <Model look={look} wave={wave} />
        {aura && (
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}>
            <ringGeometry args={[0.65, 0.74, 64]} />
            <meshBasicMaterial color={aura} transparent opacity={0.8} />
          </mesh>
        )}
        <ContactShadows
          position={[0, -0.01, 0]}
          opacity={0.35}
          scale={5}
          blur={2.5}
          far={3}
          resolution={128}
        />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={1.05}
          maxPolarAngle={1.35}
          target={[0, 0.95, 0]}
        />
      </Suspense>
    </Canvas>
  );
}
