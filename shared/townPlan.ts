// 赛博小镇规划：大区、街道、目的地与街屋。纯数据，渲染/小地图/导航/碰撞共用；不依赖 world.ts，避免循环引用。
// 扩展新街区时只需在这里追加大区与街屋，再跑 test:map / test:collision。

export type DistrictId = 'plaza' | 'commerce' | 'leisure' | 'expansion';

export interface TownDistrict {
  id: DistrictId;
  name: string;
  short: string;
  color: string;
  /** 小地图与地面色调用的轮廓（世界坐标矩形） */
  rect: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const TOWN_DISTRICTS: TownDistrict[] = [
  { id: 'commerce', name: '商业街', short: '商业', color: '#ffb347', rect: { minX: -45, maxX: -9, minZ: -20, maxZ: 33 } },
  { id: 'plaza', name: '共享广场', short: '广场', color: '#ffd166', rect: { minX: -9, maxX: 9, minZ: -20, maxZ: 33 } },
  { id: 'leisure', name: '娱乐街', short: '娱乐', color: '#b18bff', rect: { minX: 9, maxX: 45, minZ: -20, maxZ: 33 } },
  { id: 'expansion', name: '北区 · 规划中', short: '北区', color: '#6f7d99', rect: { minX: -45, maxX: 45, minZ: -33, maxZ: -20 } },
];

export function districtAt(x: number, z: number): TownDistrict {
  const id: DistrictId = z < -20 ? 'expansion' : x <= -9 ? 'commerce' : x >= 9 ? 'leisure' : 'plaza';
  return TOWN_DISTRICTS.find(d => d.id === id)!;
}

export type DestinationId = 'shop' | 'recruit' | 'leisure' | 'plaza';
/** 可站立的导航终点（不进入建筑、不触发任何玩法） */
export const TOWN_DESTINATIONS: Record<DestinationId, { name: string; x: number; z: number; district: DistrictId }> = {
  shop: { name: '奶茶店', x: -19.4, z: -1, district: 'commerce' },
  recruit: { name: '广场招募', x: -5, z: 12, district: 'plaza' },
  leisure: { name: '娱乐街', x: 18, z: 11.2, district: 'leisure' },
  plaza: { name: '共享广场', x: 0, z: 12.6, district: 'plaza' },
};

/** 地图/地面上的街名（中心点 + 方向） */
export const TOWN_STREETS: { name: string; x: number; z: number; vertical?: boolean; district: DistrictId }[] = [
  { name: '商业街', x: -19, z: 11.2, district: 'commerce' },
  { name: '娱乐街', x: 19, z: 11.2, district: 'leisure' },
  { name: '集市巷', x: -17, z: -13, district: 'commerce' },
  { name: '夜市街', x: -33, z: 0, vertical: true, district: 'commerce' },
  { name: '合影街', x: 33, z: 0, vertical: true, district: 'leisure' },
  { name: '漫步道', x: 0, z: 24, district: 'plaza' },
  { name: '北街 · 规划中', x: 0, z: -24, district: 'expansion' },
];

/** 地标（小地图文字；open=false 表示仅外观，尚未开放玩法） */
export const TOWN_LANDMARKS: { name: string; x: number; z: number; district: DistrictId; open: boolean }[] = [
  { name: '奶茶店', x: -22.5, z: -1, district: 'commerce', open: true },
  { name: '集市', x: -17, z: -13, district: 'commerce', open: true },
  { name: '夜市', x: -39, z: -8, district: 'commerce', open: false },
  { name: '社区中心', x: 0, z: 0, district: 'plaza', open: true },
  { name: '喷泉', x: 0, z: 16, district: 'plaza', open: true },
  { name: '街机厅', x: 18, z: 0, district: 'leisure', open: false },
  { name: '花园', x: 18, z: -13, district: 'leisure', open: true },
  { name: '舞台', x: 22, z: 16.5, district: 'leisure', open: false },
  { name: '合影馆', x: 39, z: -8, district: 'leisure', open: false },
];

export interface Shophouse { x: number; z: number; w: number; d: number; h: number; district: DistrictId; face: 1 | -1; sign: string }
/**
 * 连续低层街屋：沿主街两侧围合出“街”。face=+1 门脸朝 +z，-1 朝 -z。
 * 占地同时进入 world.ts BOXES（实心，不可穿行），之间留 1.2m 以上巷道。
 * 靠镜头一侧（+z）只做一层，避免挡住街上的玩家。
 */
export const TOWN_SHOPHOUSES: Shophouse[] = [
  // 商业街南侧（门脸朝主街 -z）
  { x: -26, z: 15.6, w: 4.6, d: 3.6, h: 2.6, district: 'commerce', face: -1, sign: '杂货' },
  { x: -20.4, z: 15.6, w: 4.2, d: 3.6, h: 2.9, district: 'commerce', face: -1, sign: '面馆' },
  { x: -15, z: 15.6, w: 4.2, d: 3.6, h: 2.5, district: 'commerce', face: -1, sign: '花店' },
  { x: -10.35, z: 15.6, w: 2.7, d: 3.6, h: 2.4, district: 'commerce', face: -1, sign: '烘焙' },
  // 商业街北侧（门脸朝主街 +z）
  { x: -26.8, z: 7.2, w: 4.4, d: 2.8, h: 3.6, district: 'commerce', face: 1, sign: '旧书' },
  { x: -21.6, z: 7.2, w: 3.6, d: 2.8, h: 3.0, district: 'commerce', face: 1, sign: '修理' },
  // 娱乐街北侧
  { x: 22, z: 7.2, w: 3.0, d: 2.8, h: 3.4, district: 'leisure', face: 1, sign: '桌游' },
  { x: 26.3, z: 7.2, w: 3.0, d: 2.8, h: 4.0, district: 'leisure', face: 1, sign: '唱片' },
  // 娱乐街南侧
  { x: 11.3, z: 15.6, w: 3.0, d: 3.6, h: 2.7, district: 'leisure', face: -1, sign: '抓娃娃' },
  { x: 15.6, z: 15.6, w: 3.0, d: 3.6, h: 2.4, district: 'leisure', face: -1, sign: '甜品' },
];

/** 区界门楼：横跨主街，立柱一侧借用既有路灯，另一侧新增细柱（进 CIRCLES） */
export const TOWN_GATES: { x: number; text: string; district: DistrictId }[] = [
  { x: -9, text: '商业街', district: 'commerce' },
  { x: 9, text: '娱乐街', district: 'leisure' },
];
export const GATE_POST_Z = 13.3;
/** 北区规划边界（施工围挡，进 BOXES） */
export const EXPANSION_FENCE = { minX: -5, maxX: 5, minZ: -27.45, maxZ: -27.15 };
/** 社区中心凉棚前柱（原办公室前角，进 CIRCLES） */
export const CIVIC_POSTS: [number, number][] = [[-8.25, 6.1], [8.25, 6.1]];
