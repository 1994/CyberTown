import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rng } from '../../shared/rules.ts';
import { buildingWindows, cityGround, neonText } from './textures.ts';

const GROUND_Y = -34;

/** 夜景天空：渐变穹顶 + 星星 + 月亮 */
function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color('#80b8cc') },
          mid: { value: new THREE.Color('#c2dedb') },
          horizon: { value: new THREE.Color('#f4d8b2') },
        },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP;
          void main(){ float h = vP.y; vec3 c = mix(horizon, mid, smoothstep(-0.25, 0.12, h)); c = mix(c, top, smoothstep(0.1, 0.6, h));
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    [],
  );
  const stars = useMemo(() => {
    const r = rng(42);
    const pts: number[] = [];
    for (let i = 0; i < 700; i++) {
      const th = r() * Math.PI * 2;
      const ph = 0.12 + r() * 1.2;
      const R = 320;
      pts.push(
        R * Math.cos(th) * Math.cos(ph),
        R * Math.sin(ph),
        R * Math.sin(th) * Math.cos(ph),
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <group>
      <mesh material={mat}>
        <sphereGeometry args={[360, 32, 16]} />
      </mesh>
      <points geometry={stars}>
        <pointsMaterial
          color="#cfe3ff"
          size={1.3}
          sizeAttenuation={false}
          transparent
          opacity={0}
          fog={false}
        />
      </points>
      <mesh position={[-140, 120, -210]}>
        <sphereGeometry args={[11, 32, 16]} />
        <meshBasicMaterial
          color={new THREE.Color('#fff4d6').multiplyScalar(1.6)}
          toneMapped={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}

interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tex: number;
  roof: boolean;
}

function useBuildings() {
  return useMemo(() => {
    const r = rng(2024);
    const list: Building[] = [];
    for (let i = 0; i < 190; i++) {
      const ang = r() * Math.PI * 2;
      // 园区平台约 60×44 米：楼群从平台外 50 米起环绕，近处楼顶低于平台，远处形成天际线
      const dist = 52 + r() * 140;
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;
      const near = dist < 80;
      const h = near ? 12 + r() * 30 : 20 + r() * 62 + (r() > 0.85 ? 25 : 0);
      list.push({
        x,
        z,
        w: 5 + r() * 9,
        d: 5 + r() * 9,
        h,
        tex: Math.floor(r() * 6),
        roof: r() > 0.6,
      });
    }
    return list;
  }, []);
}

function Buildings() {
  const list = useBuildings();
  const materials = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const t = buildingWindows(100 + i, i % 3 !== 2).clone();
        t.needsUpdate = true;
        t.repeat.set(1 + (i % 2), 2 + (i % 3));
        return new THREE.MeshStandardMaterial({
          color: [
            '#96aeb2',
            '#afb8b2',
            '#8fa9ad',
            '#b1aaa7',
            '#93afab',
            '#b6aaa5',
          ][i],
          emissive: '#ffffff',
          emissiveMap: t,
          emissiveIntensity: 0.12,
          roughness: 0.6,
          metalness: 0.3,
        });
      }),
    [],
  );
  const roofMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#141826', roughness: 0.8 }),
    [],
  );
  const beacon = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ff3b3b').multiplyScalar(3),
        toneMapped: false,
      }),
    [],
  );
  const beacons = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (beacons.current)
      beacons.current.visible = Math.sin(clock.elapsedTime * 3) > -0.2;
  });
  return (
    <group position={[0, GROUND_Y, 0]}>
      {list.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]}>
          <mesh position={[0, b.h / 2, 0]} material={materials[b.tex]}>
            <boxGeometry args={[b.w, b.h, b.d]} />
          </mesh>
          {b.roof && (
            <mesh position={[0, b.h + 1.2, 0]} material={roofMat}>
              <boxGeometry args={[b.w * 0.6, 2.4, b.d * 0.6]} />
            </mesh>
          )}
        </group>
      ))}
      <group ref={beacons}>
        {list
          .filter((b) => b.h > 50)
          .map((b, i) => (
            <mesh
              key={i}
              position={[b.x, b.h + (b.roof ? 2.6 : 0.4), b.z]}
              material={beacon}
            >
              <sphereGeometry args={[0.45, 8, 8]} />
            </mesh>
          ))}
      </group>
    </group>
  );
}

/** 地面街道 + 车流光点 */
function Streets() {
  const ground = cityGround();
  const cars = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 140 }, () => ({
      lane: Math.floor(r() * 16) - 8,
      axis: r() > 0.5 ? 0 : 1,
      offset: r() * 400,
      speed: 6 + r() * 10,
      dir: r() > 0.5 ? 1 : -1,
      warm: r() > 0.5,
    }));
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorsSet = useRef(false);
  useFrame(({ clock }) => {
    const m = cars.current;
    if (!m) return;
    const t = clock.elapsedTime;
    data.forEach((c, i) => {
      const along =
        ((((c.offset + t * c.speed * c.dir) % 400) + 400) % 400) - 200;
      const across = c.lane * 32 + 2;
      if (c.axis === 0) dummy.position.set(along, GROUND_Y + 0.4, across);
      else dummy.position.set(across, GROUND_Y + 0.4, along);
      dummy.rotation.y = c.axis === 0 ? 0 : Math.PI / 2;
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (!colorsSet.current)
        m.setColorAt(
          i,
          new THREE.Color(c.warm ? '#ff5a3a' : '#fff1c9').multiplyScalar(3),
        );
    });
    colorsSet.current = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, GROUND_Y, 0]}>
        <planeGeometry args={[520, 520]} />
        <meshStandardMaterial
          map={ground}
          emissive="#ffffff"
          emissiveMap={ground}
          emissiveIntensity={0.7}
          roughness={0.9}
        />
      </mesh>
      <instancedMesh ref={cars} args={[undefined, undefined, data.length]}>
        <boxGeometry args={[1.6, 0.4, 0.6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function CityNeon() {
  const kpi = neonText([{ text: '准点下班', color: '#fff0b7', size: 150 }]);
  const coffee = neonText([{ text: '续命咖啡', color: '#ff4fb8', size: 150 }]);
  return (
    <group>
      <mesh position={[-34, 6, -40]} rotation-y={0.5}>
        <planeGeometry args={[16, 4]} />
        <meshBasicMaterial
          map={kpi}
          transparent
          toneMapped={false}
          color={new THREE.Color(2, 2, 2)}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[-46, -2, 12]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[16, 4]} />
        <meshBasicMaterial
          map={coffee}
          transparent
          toneMapped={false}
          color={new THREE.Color(2, 2, 2)}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function City() {
  return (
    <group>
      <Sky />
      <Buildings />
      <Streets />
      <CityNeon />
    </group>
  );
}
