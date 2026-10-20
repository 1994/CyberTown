import { SharedGeometry } from './SharedGeometry.tsx';
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { StaticBatch } from './StaticBatch.tsx';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Look } from '../../shared/types.ts';
import { std } from './materials.ts';
import { FaceMask } from './FaceMask.tsx';

/** 可被动画驱动的骨骼节点（程序化 Q 版人物，统一比例：头身比约 1:1.5） */
export interface Rig {
  root: THREE.Group;
  body: THREE.Group; // 整体上下（坐下/弹跳）
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  box: THREE.Group; // 纸箱（被挖走时收拾东西）
  briefcase: THREE.Group; // 公文包（签约入职时提着）
}

const HIP_Y = 0.4;

function Hair({ look }: { look: Look }) {
  const hair = std(look.hair, 0.7);
  const R = 0.315;
  switch (look.hairStyle) {
    case 'bald':
      return (
        <mesh position={[0, 0.24, -0.02]} rotation-x={Math.PI / 2} material={hair}>
          <SharedGeometry kind="torus" args={[0.27, 0.05, 8, 24, Math.PI]} />
        </mesh>
      );
    case 'cap':
      return (
        <group>
          <mesh position={[0, 0.33, 0]} material={std(look.shirt, 0.6)} castShadow>
            <SharedGeometry kind="sphere" args={[R + 0.01, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.1]} />
          </mesh>
          <mesh position={[0, 0.36, 0.24]} rotation-x={0.12} material={std(look.shirt, 0.6)}>
            <SharedGeometry kind="box" args={[0.36, 0.025, 0.22]} />
          </mesh>
          <mesh position={[0, 0.2, -0.12]} material={hair}>
            <SharedGeometry kind="sphere" args={[R - 0.005, 20, 10, Math.PI * 0.75, Math.PI * 1.5, Math.PI / 2.2, Math.PI / 3]} />
          </mesh>
        </group>
      );
    default: {
      const cap = (
        <mesh position={[0, 0.3, -0.015]} rotation-x={-0.25} material={hair} castShadow>
          <SharedGeometry kind="sphere" args={[R + 0.02, 28, 14, 0, Math.PI * 2, 0, Math.PI / 1.95]} />
        </mesh>
      );
      return (
        <group>
          {cap}
          {/* 刘海 */}
          <mesh position={[0.06, 0.47, 0.2]} rotation={[0.9, 0, -0.3]} scale={[1.4, 0.5, 0.7]} material={hair}>
            <SharedGeometry kind="sphere" args={[0.12, 14, 10]} />
          </mesh>
          {look.hairStyle === 'spiky' &&
            [-0.14, -0.04, 0.06, 0.16].map((x, i) => (
              <mesh key={i} position={[x, 0.6, -0.02 + (i % 2) * 0.06]} rotation={[-0.3, 0, x * 1.5]} material={hair}>
                <SharedGeometry kind="cone" args={[0.07, 0.2, 6]} />
              </mesh>
            ))}
          {look.hairStyle === 'bun' && (
            <mesh position={[0, 0.66, -0.08]} material={hair} castShadow>
              <SharedGeometry kind="sphere" args={[0.12, 16, 12]} />
            </mesh>
          )}
          {look.hairStyle === 'bob' && (
            <mesh position={[0, 0.2, -0.02]} scale={[1.12, 0.85, 1.08]} material={hair}>
              <SharedGeometry kind="sphere" args={[R, 24, 12, Math.PI * 0.62, Math.PI * 1.76, Math.PI / 3, Math.PI / 2.6]} />
            </mesh>
          )}
          {look.hairStyle === 'long' && (
            <>
              <mesh position={[0, 0.2, -0.02]} scale={[1.1, 0.9, 1.08]} material={hair}>
                <SharedGeometry kind="sphere" args={[R, 24, 12, Math.PI * 0.62, Math.PI * 1.76, Math.PI / 3, Math.PI / 2.2]} />
              </mesh>
              <RoundedBox args={[0.5, 0.5, 0.14]} radius={0.06} position={[0, 0.02, -0.2]} material={hair} castShadow />
            </>
          )}
        </group>
      );
    }
  }
}

function Face({ look }: { look: Look }) {
  return (
    <group>
      <FaceMask look={look} />
      {look.accessory === 'glasses' && (
        <group position={[0, 0.3, 0.365]}>
          {[-0.105, 0.105].map((x) => (
            <mesh key={x} position={[x, 0, 0]} material={std('#222', 0.3, 0.5)}>
              <SharedGeometry kind="torus" args={[0.062, 0.011, 6, 20]} />
            </mesh>
          ))}
          <mesh material={std('#222', 0.3, 0.5)}>
            <SharedGeometry kind="box" args={[0.08, 0.012, 0.012]} />
          </mesh>
        </group>
      )}
      {look.accessory === 'sunglasses' && (
        <group position={[0, 0.31, 0.37]}>
          {[-0.105, 0.105].map((x) => (
            <RoundedBox key={x} args={[0.15, 0.08, 0.02]} radius={0.02} position={[x, 0, 0]} material={std('#111', 0.1, 0.8)} />
          ))}
          <mesh material={std('#111', 0.2)}>
            <SharedGeometry kind="box" args={[0.08, 0.015, 0.012]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

const CharacterRig = forwardRef<Rig, { look: Look; scale?: number }>(function Character({ look, scale = 1 }, ref) {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const box = useRef<THREE.Group>(null!);
  const briefcase = useRef<THREE.Group>(null!);
  useImperativeHandle(ref, () => ({
    root: root.current,
    body: body.current,
    torso: torso.current,
    head: head.current,
    armL: armL.current,
    armR: armR.current,
    legL: legL.current,
    legR: legR.current,
    box: box.current,
    briefcase: briefcase.current,
  }));

  const m = useMemo(
    () => ({
      skin: std(look.skin, 0.55),
      shirt: std(look.shirt, 0.7),
      pants: std(look.pants, 0.75),
      shoe: std('#23242c', 0.5),
    }),
    [look],
  );

  return (
    <group ref={root} scale={scale}>
      <group ref={body}>
        {/* 腿 */}
        {(
          [
            [-0.1, legL],
            [0.1, legR],
          ] as const
        ).map(([x, r]) => (
          <group key={x} ref={r} position={[x, HIP_Y, 0]}>
            <mesh position={[0, -0.17, 0]} material={m.pants} castShadow>
              <SharedGeometry kind="capsule" args={[0.078, 0.2, 4, 10]} />
            </mesh>
            <RoundedBox args={[0.15, 0.08, 0.22]} radius={0.035} position={[0, -0.35, 0.04]} material={m.shoe} castShadow />
          </group>
        ))}
        {/* 躯干 */}
        <group ref={torso} position={[0, HIP_Y, 0]}>
          <mesh position={[0, 0.03, 0]} material={m.pants} castShadow>
            <SharedGeometry kind="cylinder" args={[0.19, 0.19, 0.12, 20]} />
          </mesh>
          <mesh position={[0, 0.25, 0]} material={m.shirt} castShadow>
            <SharedGeometry kind="capsule" args={[0.2, 0.16, 6, 20]} />
          </mesh>
          {/* 领口 */}
          <mesh position={[0, 0.45, 0.02]} material={m.skin}>
            <SharedGeometry kind="cylinder" args={[0.07, 0.08, 0.06, 12]} />
          </mesh>
          {look.accessory === 'tie' && (
            <group position={[0, 0.3, 0.19]}>
              <mesh position={[0, 0.1, 0]} material={std('#c0392b', 0.5)}>
                <SharedGeometry kind="box" args={[0.06, 0.05, 0.03]} />
              </mesh>
              <mesh position={[0, -0.02, 0.01]} rotation-z={Math.PI / 4} material={std('#c0392b', 0.5)}>
                <SharedGeometry kind="box" args={[0.07, 0.07, 0.02]} />
              </mesh>
              <mesh position={[0, 0.03, 0.005]} material={std('#c0392b', 0.5)}>
                <SharedGeometry kind="box" args={[0.05, 0.14, 0.02]} />
              </mesh>
            </group>
          )}
          {look.accessory === 'scarf' && (
            <mesh position={[0, 0.43, 0]} rotation-x={Math.PI / 2} material={std('#ffd166', 0.8)}>
              <SharedGeometry kind="torus" args={[0.13, 0.05, 8, 20]} />
            </mesh>
          )}
          {/* 工牌 */}
          <mesh position={[0.08, 0.2, 0.2]} material={std('#91eeff', 0.4, 0.2, { emissive: '#38b9d1', emissiveIntensity: 0.45 })}>
            <SharedGeometry kind="box" args={[0.07, 0.09, 0.01]} />
          </mesh>
          {/* 手臂（肩部为枢轴） */}
          {(
            [
              [-0.25, armL],
              [0.25, armR],
            ] as const
          ).map(([x, r]) => (
            <group key={x} ref={r} position={[x, 0.4, 0]}>
              <mesh position={[0, -0.14, 0]} material={m.shirt} castShadow>
                <SharedGeometry kind="capsule" args={[0.062, 0.17, 4, 10]} />
              </mesh>
              <mesh position={[0, -0.3, 0]} material={m.skin} castShadow>
                <SharedGeometry kind="sphere" args={[0.065, 12, 10]} />
              </mesh>
            </group>
          ))}
          {/* 头 */}
          <group ref={head} position={[0, 0.46, 0]}>
            <StaticBatch>
              <mesh position={[0, 0.3, 0]} material={m.skin} castShadow>
                <SharedGeometry kind="sphere" args={[0.3, 32, 24]} />
              </mesh>
              {[-0.3, 0.3].map((x) => (
                <mesh key={x} position={[x, 0.29, 0]} material={m.skin}>
                  <SharedGeometry kind="sphere" args={[0.06, 10, 8]} />
                </mesh>
              ))}
              <Face look={look} />
              <Hair look={look} />
              {look.accessory === 'headset' && (
                <group position={[0, 0.3, 0]}>
                  <mesh rotation-z={0} material={std('#2a2a33', 0.4)}>
                    <SharedGeometry kind="torus" args={[0.33, 0.02, 6, 24, Math.PI]} />
                  </mesh>
                  {[-0.33, 0.33].map((x) => (
                    <mesh key={x} position={[x, 0, 0]} rotation-z={Math.PI / 2} material={std('#2a2a33', 0.4)}>
                      <SharedGeometry kind="cylinder" args={[0.07, 0.07, 0.05, 14]} />
                    </mesh>
                  ))}
                  <mesh position={[0.24, -0.12, 0.16]} rotation={[0, -0.6, 0.9]} material={std('#2a2a33', 0.4)}>
                    <SharedGeometry kind="capsule" args={[0.012, 0.22, 4, 6]} />
                  </mesh>
                </group>
              )}
            </StaticBatch>
          </group>
          {/* 纸箱：被挖角时抱在胸前 */}
          <group ref={box} position={[0, 0.32, 0.38]} visible={false} scale={1.15}>
            <mesh material={std('#c79a62', 0.9)} castShadow>
              <SharedGeometry kind="box" args={[0.46, 0.3, 0.32]} />
            </mesh>
            <mesh position={[0, 0.151, 0]} material={std('#b38550', 0.9)}>
              <SharedGeometry kind="box" args={[0.47, 0.005, 0.06]} />
            </mesh>
            {/* 箱子里的盆栽与相框 */}
            <mesh position={[-0.1, 0.2, 0]} material={std('#4f9a4a', 0.7)}>
              <SharedGeometry kind="icosahedron" args={[0.09, 1]} />
            </mesh>
            <mesh position={[0.12, 0.2, -0.04]} rotation-x={-0.3} material={std('#7a4e32', 0.5)}>
              <SharedGeometry kind="box" args={[0.14, 0.16, 0.02]} />
            </mesh>
          </group>
          {/* 公文包：签约入职时提在右手 */}
          <group ref={briefcase} position={[0.27, -0.12, 0.05]} visible={false}>
            <RoundedBox args={[0.08, 0.24, 0.32]} radius={0.02} material={std('#5a3420', 0.45)} castShadow />
            <mesh position={[0, 0.15, 0]} rotation-y={Math.PI / 2} material={std('#2a1a10', 0.4)}>
              <SharedGeometry kind="torus" args={[0.05, 0.012, 6, 12, Math.PI]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
});

export const Character = memo(CharacterRig, (a, b) => (a.scale ?? 1) === (b.scale ?? 1) && shallow(a.look, b.look));

export const CHAR = { HIP_Y };
