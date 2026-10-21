import * as THREE from 'three';

// 统一材质系统：所有家具/角色共享同一套工业深灰材质 + 青红霓虹 / 警示黄的调色板与粗糙度规则。
export const PALETTE = {
  oak: '#3b454e',
  walnut: '#1c282e',
  wall: '#27333b',
  wallAccent: '#64352f',
  metal: '#16232a',
  steel: '#91a4a8',
  fabricBlue: '#365567',
  fabricTeal: '#196d70',
  fabricMustard: '#d5ad37',
  leaf: '#286c60',
  leafDark: '#17463e',
  pot: '#34434b',
  terracotta: '#694138',
  base: '#101a21',
  neonPink: '#ff3959',
  neonCyan: '#38eee3',
  warmLight: '#ffd49a',
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
