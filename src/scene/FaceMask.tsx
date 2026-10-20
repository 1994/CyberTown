import { SharedGeometry } from './SharedGeometry.tsx';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Look } from '../../shared/types.ts';
import { std } from './materials.ts';

function canvasTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function canvas() {
  const image = document.createElement('canvas');
  image.width = image.height = 256;
  return [image, image.getContext('2d')!] as const;
}

/** Local, original placeholder; never depends on an external avatar service. */
function identityPortrait(name: string, skin: string, hair: string, shirt: string) {
  const [image, g] = canvas();
  const bg = g.createLinearGradient(0, 0, 256, 256);
  bg.addColorStop(0, '#f8eed6');
  bg.addColorStop(1, shirt);
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = shirt;
  g.beginPath();
  g.ellipse(128, 250, 93, 63, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = skin;
  g.fillRect(109, 165, 38, 42);
  g.beginPath();
  g.ellipse(128, 111, 68, 81, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hair;
  g.beginPath();
  g.moveTo(60, 109);
  g.bezierCurveTo(40, -3, 220, -6, 198, 109);
  g.lineTo(184, 73);
  g.quadraticCurveTo(147, 97, 95, 64);
  g.lineTo(60, 109);
  g.fill();
  g.fillStyle = '#293a35';
  for (const x of [103, 153]) {
    g.beginPath();
    g.ellipse(x, 119, 6, 8, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#eb9c8d';
  for (const x of [87, 169]) {
    g.beginPath();
    g.ellipse(x, 143, 12, 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#8c4d48';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(128, 143, 18, 0.2, Math.PI - 0.2);
  g.stroke();
  g.fillStyle = '#fff9ee';
  g.beginPath();
  g.roundRect(48, 200, 160, 41, 20);
  g.fill();
  g.fillStyle = '#304b40';
  g.font = '800 28px "PingFang SC", "Microsoft YaHei", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText([...name].slice(0, 4).join('') || '同事', 128, 222, 142);
  return canvasTexture(image);
}

function useMaskTexture(look: Look) {
  const { avatarUrl = '', avatarName = '同事', skin, hair, shirt } = look;
  const texture = useMemo(
    () => identityPortrait(avatarName, skin, hair, shirt),
    [avatarName, skin, hair, shirt, avatarUrl],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    if (!avatarUrl) return;
    let active = true;
    const image = new Image();
    // WebGL requires CORS for off-site avatars; failure keeps the local portrait.
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      if (!active || !image.naturalWidth || !image.naturalHeight) return;
      const g = texture.image.getContext('2d')!;
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      g.fillStyle = '#fff9ee';
      g.fillRect(0, 0, 256, 256);
      g.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
      texture.needsUpdate = true;
    };
    image.onerror = () => { /* Preserve the identity portrait, never suspend the world. */ };
    image.src = avatarUrl;
    return () => {
      active = false;
      image.onload = image.onerror = null;
      image.src = '';
    };
  }, [avatarUrl, texture]);
  return texture;
}

/** A physical photo mask attached to the head, with a rim and side straps. */
export function FaceMask({ look }: { look: Look }) {
  const texture = useMaskTexture(look);
  return (
    <group name="avatar-face-mask">
      {[-0.29, 0.29].map((x) => (
        <mesh key={x} position={[x, 0.3, 0.065]} material={std('#506257', 0.9)}>
          <SharedGeometry kind="box" args={[0.026, 0.044, 0.49]} />
        </mesh>
      ))}
      <group position={[0, 0.3, 0.315]}>
        <mesh rotation-x={Math.PI / 2} material={std('#e7dfcb', 0.8)} castShadow>
          <SharedGeometry kind="cylinder" args={[0.323, 0.323, 0.04, 48]} />
        </mesh>
        <mesh position={[0, 0, 0.027]}>
          <SharedGeometry kind="circle" args={[0.303, 64]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, 0.03]} material={std('#fffcf2', 0.5)}>
          <SharedGeometry kind="torus" args={[0.311, 0.016, 8, 64]} />
        </mesh>
        {[-0.313, 0.313].map((x) => (
          <mesh key={x} position={[x, 0, 0.035]} material={std('#b79b5d', 0.45, 0.35)}>
            <SharedGeometry kind="sphere" args={[0.017, 10, 8]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
