import * as THREE from 'three';

// 统一材质系统：所有家具/角色共享同一套低饱和暖色调 + 霓虹点缀的调色板与粗糙度规则。
export const PALETTE = {
  oak: '#d9b38a',
  walnut: '#7a4e32',
  wall: '#ece4d8',
  wallAccent: '#c96f4a',
  metal: '#2c313d',
  steel: '#9aa3b2',
  fabricBlue: '#3c4f7d',
  fabricTeal: '#2f7c7a',
  fabricMustard: '#d9a441',
  leaf: '#4f9a4a',
  leafDark: '#2f6b3a',
  pot: '#e7e2da',
  terracotta: '#c76b4a',
  base: '#1b2030',
  neonPink: '#e5ac97',
  neonCyan: '#92c4ad',
  warmLight: '#ffd29a',
};

const mats = new Map<string, THREE.Material>();

export function std(
  color: string,
  roughness = 0.62,
  metalness = 0,
  extra: Partial<THREE.MeshStandardMaterialParameters> = {},
) {
  const key = `${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      ...extra,
    });
    mats.set(key, m);
  }
  return m as THREE.MeshStandardMaterial;
}

export function glow(color: string, intensity = 2.2) {
  const key = `glow|${color}|${intensity}`;
  let m = mats.get(key);
  if (!m) {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    mats.set(key, m);
  }
  return m;
}

export const glassMat = new THREE.MeshPhysicalMaterial({
  color: '#bfe6ff',
  roughness: 0.05,
  metalness: 0.1,
  transparent: true,
  opacity: 0.16,
  envMapIntensity: 1.6,
  clearcoat: 1,
  side: THREE.DoubleSide,
  depthWrite: false,
});

export const partitionGlass = new THREE.MeshPhysicalMaterial({
  color: '#d8f0ff',
  roughness: 0.25,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
  depthWrite: false,
});
