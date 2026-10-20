import * as THREE from 'three';

// 统一材质系统：所有家具/角色共享同一套午夜蓝材质 + 青紫霓虹的调色板与粗糙度规则。
export const PALETTE = {
  oak: '#3b4b67',
  walnut: '#202d46',
  wall: '#28354f',
  wallAccent: '#573058',
  metal: '#1c2940',
  steel: '#8c9fba',
  fabricBlue: '#435d97',
  fabricTeal: '#247f88',
  fabricMustard: '#d9a441',
  leaf: '#398d80',
  leafDark: '#22574f',
  pot: '#35475f',
  terracotta: '#4c335d',
  base: '#1b2030',
  neonPink: '#ff4fca',
  neonCyan: '#48eeff',
  warmLight: '#b8e7ff',
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
