import { SHOPPING, BIKE_STAND, BASKETBALL, SPORTS_POSTS } from './townActivities.ts';
import arcade from '../gameplay/arcade.json' with { type: 'json' };
import { TOWN_OPPORTUNITIES } from './townExplore.ts';
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

// 180×132 版图：旧内环（±45×±33）为老镇中心，东西外区各扩一片，北侧 z<-36 为北环街区，保留两处后续建设地块。
export const EXPANSION_Z = -36;
export const TOWN_DISTRICTS: TownDistrict[] = [
  { id: 'commerce', name: '商业街', short: '商业', color: '#ffb347', rect: { minX: -90, maxX: -9, minZ: EXPANSION_Z, maxZ: 66 } },
  { id: 'plaza', name: '小镇广场', short: '广场', color: '#ffd166', rect: { minX: -9, maxX: 9, minZ: EXPANSION_Z, maxZ: 66 } },
  { id: 'leisure', name: '娱乐街', short: '娱乐', color: '#b18bff', rect: { minX: 9, maxX: 90, minZ: EXPANSION_Z, maxZ: 66 } },
  { id: 'expansion', name: '北环街区', short: '北区', color: '#6f7d99', rect: { minX: -90, maxX: 90, minZ: -66, maxZ: EXPANSION_Z } },
];

export function districtAt(x: number, z: number): TownDistrict {
  const id: DistrictId = z < EXPANSION_Z ? 'expansion' : x <= -9 ? 'commerce' : x >= 9 ? 'leisure' : 'plaza';
  return TOWN_DISTRICTS.find(d => d.id === id)!;
}

export type SiteId = 'west-market' | 'river-dock' | 'star-park' | 'river-walk';
export type DestinationId = 'shop' | 'recruit' | 'arcade' | 'shopping' | 'bicycle' | 'basketball' | 'north-ring' | 'neon-quarter' | 'leisure' | 'plaza' | SiteId;
export const SITE_IDS = TOWN_OPPORTUNITIES.map(o => o.id) as SiteId[];
export const isSite = (d: string): d is SiteId => (SITE_IDS as string[]).includes(d);
/** 可站立的导航终点（不进入建筑、不触发任何玩法） */
export const TOWN_DESTINATIONS: Record<DestinationId, { name: string; x: number; z: number; district: DistrictId }> = {
  'neon-quarter': {name:'霓虹都会 · 示范街角',x:58,z:-50,district:'expansion'},
  'north-ring': {name:'北环街区',x:0,z:-50,district:'expansion'},
  shopping: { name: '霓虹购物街', ...SHOPPING, district: 'commerce' },
  bicycle: { name: '路边单车', ...BIKE_STAND, district: 'plaza' },
  basketball: { name: '夜光篮球场', x: BASKETBALL.x-8.5, z: BASKETBALL.z-3, district: 'leisure' },
  arcade: { name: '小游戏大厅', x: arcade.x, z: arcade.z, district: 'leisure' },
  shop: { name: '奶茶店', x: -19.4, z: -1, district: 'commerce' },
  recruit: { name: '雇佣大厅', x: -5, z: 12, district: 'plaza' },
  leisure: { name: '娱乐街', x: 18, z: 11.2, district: 'leisure' },
  plaza: { name: '小镇广场', x: 0, z: 12.6, district: 'plaza' },
  // 商圈据点：坐标唯一来源 gameplay/town-opportunities.json
  ...Object.fromEntries(TOWN_OPPORTUNITIES.map(o => [o.id, { name: o.name, x: o.x, z: o.z, district: o.district }])) as Record<SiteId, { name: string; x: number; z: number; district: DistrictId }>,
};

/** 地图/地面上的街名（中心点 + 方向） */
export const TOWN_STREETS: { name: string; x: number; z: number; vertical?: boolean; district: DistrictId }[] = [
  { name: '商业街', x: -19, z: 11.2, district: 'commerce' },
  { name: '娱乐街', x: 19, z: 11.2, district: 'leisure' },
  { name: '集市巷', x: -17, z: -13, district: 'commerce' },
  { name: '夜市街', x: -33, z: 0, vertical: true, district: 'commerce' },
  { name: '合影街', x: 33, z: 0, vertical: true, district: 'leisure' },
  { name: '漫步道', x: 0, z: 24, district: 'plaza' },
  { name: '北街', x: 0, z: -24, district: 'plaza' },
  { name: '西街大道', x: -58, z: -16.3, district: 'commerce' },
  { name: '西二街', x: -74, z: 14, vertical: true, district: 'commerce' },
  { name: '星光大道', x: 58, z: -16.3, district: 'leisure' },
  { name: '乐园街', x: 82, z: 14, vertical: true, district: 'leisure' },
  { name: '滨河步道', x: 0, z: 43, district: 'plaza' },
  { name: '北环街', x: 0, z: -50, district: 'expansion' },
];

/** 地标（小地图文字；open=false 表示仅外观，尚未开放玩法） */
export const TOWN_LANDMARKS: { name: string; x: number; z: number; district: DistrictId; open: boolean }[] = [
  { name: '奶茶店', x: -22.5, z: -1, district: 'commerce', open: true },
  { name: '集市', x: -17, z: -13, district: 'commerce', open: true },
  { name: '夜市', x: -39, z: -8, district: 'commerce', open: false },
  { name: '社区中心', x: 0, z: 0, district: 'plaza', open: false },
  { name: '喷泉', x: 0, z: 16, district: 'plaza', open: true },
  { name: '小游戏大厅', x: 18, z: 0, district: 'leisure', open: true },
  { name: '花园', x: 18, z: -13, district: 'leisure', open: true },
  { name: '舞台', x: 22, z: 16.5, district: 'leisure', open: false },
  { name: '合影馆', x: 39, z: -8, district: 'leisure', open: false },
  { name: '河港吊机', x: -52, z: 37.5, district: 'commerce', open: false },
  { name: '摩天轮', x: 64, z: -27, district: 'leisure', open: false },
  { name: '旋转木马', x: 75, z: -5, district: 'leisure', open: false },
  { name: '南岸公园', x: 0, z: 60, district: 'plaza', open: true },
];

export interface Shophouse { x: number; z: number; w: number; d: number; h: number; district: DistrictId; face: 1 | -1; sign: string; /** 纵街街屋：门脸朝 +x(1)/-x(-1) */ side?: 1 | -1 }
/**
 * 连续低层街屋：沿主街两侧围合出“街”。face=+1 门脸朝 +z，-1 朝 -z。
 * 占地同时进入 world.ts BOXES（实心，不可穿行），之间留 1.2m 以上巷道。
 * 靠镜头一侧（+z）只做一层，避免挡住街上的玩家。
 */
export const TOWN_SHOPHOUSES: Shophouse[] = [
  // 商业街南侧（门脸朝主街 -z）
  { x: -26, z: 15.6, w: 4.6, d: 3.6, h: 2.6, district: 'commerce', face: -1, sign: '杂货' },
  { x: -20.4, z: 15.6, w: 4.2, d: 3.6, h: 2.9, district: 'commerce', face: -1, sign: '面馆' },
  { x: -15, z: 15.6, w: 4.2, d: 3.6, h: 2.5, district: 'commerce', face: -1, sign: '夜骑车行' },
  { x: -10.35, z: 15.6, w: 2.7, d: 3.6, h: 2.4, district: 'commerce', face: -1, sign: '烘焙' },
  // 商业街北侧（门脸朝主街 +z）
  { x: -26.8, z: 7.2, w: 4.4, d: 2.8, h: 3.6, district: 'commerce', face: 1, sign: '霓虹衣橱' },
  { x: -21.6, z: 7.2, w: 3.6, d: 2.8, h: 3.0, district: 'commerce', face: 1, sign: '面具工坊' },
  // 娱乐街北侧
  { x: 22, z: 7.2, w: 3.0, d: 2.8, h: 3.4, district: 'leisure', face: 1, sign: '桌游' },
  { x: 26.3, z: 7.2, w: 3.0, d: 2.8, h: 4.0, district: 'leisure', face: 1, sign: '唱片' },
  // 娱乐街南侧
  { x: 11.3, z: 15.6, w: 3.0, d: 3.6, h: 2.7, district: 'leisure', face: -1, sign: '抓娃娃' },
  { x: 15.6, z: 15.6, w: 3.0, d: 3.6, h: 2.4, district: 'leisure', face: -1, sign: '甜品' },
  ...outerHouses(),
  ...northHouses(),
];

/** 北环两侧成组街屋，留出中轴广场、纵向通路和装卸巷。 */
function northHouses(): Shophouse[] {
  const xs=[-82,-74,-66,-50,-42,-24,-16,16,24,42,50,66,74,82];
  const west=['机修','零件','快递','工具','夜班食堂','仓储','旧物'];
  const east=['唱片','模型','光影','甜品','花店','书屋','画室'];
  return [-60,-41].flatMap((z,row)=>xs.map((x,i)=>({x,z,w:5.6+(i%2)*.6,d:5.2,h:row===0&&x>=16?([22,30,26,38,28,34,20][i-7]):row===0?5+(i%3)*1.4:3+(i%3)*.45,face:(row===0?1:-1) as 1|-1,district:(x<0?'commerce':'leisure') as DistrictId,sign:(x<0?west:east)[i%7]})));
}

/** 外区街屋：西街大道/西二街（商业）与星光大道/乐园街（娱乐）两侧围合，留出据点口袋广场。 */
function outerHouses(): Shophouse[] {
  const C = 'commerce' as const, L = 'leisure' as const;
  const list: Shophouse[] = [];
  const row = (district: DistrictId, z: number, face: 1 | -1, items: [number, number, number, string][]) =>
    items.forEach(([x, w, h, sign]) => list.push({ x, z, w, d: 3.6, h, district, face, sign }));
  // 西街大道（z -18..-14.6）北侧/南侧；x -71..-57 留给西街集市
  row(C, -21.6, 1, [[-83.5, 5, 3.8, '茶叶'], [-77.6, 4.4, 3.2, '布行'], [-52.8, 4.4, 4.2, '钟表'], [-47.2, 4.2, 3.4, '粮油']]);
  row(C, -11, -1, [[-85, 4.2, 2.8, '干货'], [-79.2, 4, 3.0, '五金'], [-52, 4.4, 2.8, '药铺'], [-46.6, 3.6, 2.6, '早点']]);
  // 星光大道（z -18..-14.6）；x 57..71 留给星光乐园
  row(L, -21.6, 1, [[44, 4, 3.6, '电玩'], [49.4, 4, 3.0, '桌球'], [77, 4.2, 3.8, '剧场'], [82.6, 3.6, 3.2, '冰室']]);
  row(L, -11, -1, [[44.5, 4, 2.8, '画廊'], [50, 4.2, 2.6, '奶昔'], [86.5, 3, 2.6, '贴纸']]);
  // 纵街两侧（门脸朝街：面朝 ±x 的街屋用 w/d 互换表示，face 仍按 z 记，渲染时按 side 旋转）
  const col = (district: DistrictId, x: number, items: [number, number, string][]) =>
    items.forEach(([z, h, sign]) => list.push({ x, z, w: 3.4, d: 5, h, district, face: 1, sign, side: x < (district === C ? -74 : 82) ? 1 : -1 }));
  col(C, -78.8, [[-2, 3.4, '米铺'], [5, 3.0, '裁缝'], [13, 3.6, '照相'], [21, 3.2, '酒肆'], [29, 3.0, '渔具']]);
  col(C, -69.6, [[-1, 3.0, '杂铺'], [7, 3.4, '冷饮'], [15, 3.0, '烟纸'], [23, 3.6, '旅舍'], [31, 3.2, '面包']]);
  col(L, 77.3, [[4, 3.2, '密室'], [11, 3.6, '舞室'], [19, 3.0, '手作'], [27, 3.4, '影院'], [34, 3.0, '霓虹']]);
  col(L, 86.7, [[3, 3.0, '甜筒'], [10, 3.4, '投篮'], [18, 3.0, '唱吧'], [26, 3.2, '夜宵']]);
  // 坊区：内环与外街之间的低层小巷街坊（商业“南巷坊” / 娱乐“霓虹坊”），围出口袋花园
  // [x, z, w, d, h, face, side?, sign]：side 存在时门脸朝 ±x（w/d 为世界占地）
  const q = (district: DistrictId, items: [number, number, number, number, number, 1 | -1, (1 | -1) | 0, string][]) =>
    items.forEach(([x, z, w, d, h, face, side, sign]) => list.push({ x, z, w, d, h, district, face, sign, ...(side ? { side } : {}) }));
  q(C, [
    [-64.4, 7.6, 3.2, 3.2, 2.8, 1, 0, '豆腐'], [-59.6, 7.6, 3.2, 3.2, 3.4, 1, 0, '酱园'], [-57.9, 3, 3, 3.4, 2.6, 1, 1, '剪纸'],
    [-50.8, 7.6, 3.2, 3.2, 3.0, 1, 0, '茶摊'], [-46.2, 7.6, 3.2, 3.2, 3.6, 1, 0, '当铺'], [-52.1, 3, 3, 3.4, 2.7, 1, -1, '糖画'],
    [-64.4, 14.4, 3.2, 3.2, 2.6, -1, 0, '香铺'], [-59.6, 14.4, 3.2, 3.2, 3.1, -1, 0, '针线'],
    [-57.9, 20, 3, 3.4, 2.8, 1, 1, '刻章'], [-57.9, 26, 3, 3.4, 3.3, 1, 1, '凉茶'],
    [-64.4, 31.4, 3.2, 3.2, 2.9, 1, 0, '鱼档'], [-59.6, 31.4, 3.2, 3.2, 2.6, 1, 0, '果铺'],
    [-50.8, 14.4, 3.2, 3.2, 3.2, -1, 0, '灯笼'], [-46.2, 14.4, 3.2, 3.2, 2.7, -1, 0, '竹器'],
    [-52.1, 20, 3, 3.4, 2.9, 1, -1, '陶器'], [-52.1, 26, 3, 3.4, 3.4, 1, -1, '扇庄'],
    [-48.5, 31.4, 3.6, 3.2, 3.0, 1, 0, '船具'],
  ]);
  q(L, [
    [46.6, 7.6, 3.2, 3.2, 3.2, 1, 0, '漫画'], [51.4, 7.6, 3.2, 3.2, 2.7, 1, 0, '扭蛋'],
    [61.4, 7.6, 3.2, 3.2, 3.6, 1, 0, '酒吧'], [66.8, 7.6, 3.6, 3.2, 2.8, 1, 0, '球馆'],
    [46.6, 14.4, 3.2, 3.2, 2.8, -1, 0, '模型'], [51.4, 14.4, 3.2, 3.2, 3.4, -1, 0, 'VR'],
    [54.1, 21, 3, 3.4, 3.0, 1, 1, '拍贴'], [54.1, 27.5, 3, 3.4, 2.7, 1, 1, '花茶'],
    [61.4, 14.4, 3.2, 3.2, 3.0, -1, 0, '爵士'], [66.6, 14.4, 3.2, 3.2, 3.5, -1, 0, '咖啡'],
    [59.9, 22, 3, 3.4, 2.8, 1, -1, '纹身'],
  ]);
  return list;
}

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

// ───────── 扩展版图：外区道路、河流与桥、地标障碍、树 ─────────
type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
const R = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });

/** 外区道路（仅绘制/小地图；可走性由障碍决定） */
export const TOWN_ROADS: (Rect & { district: DistrictId })[] = [
  { ...R(-86, -35, -18, -14.6), district: 'commerce' }, // 西街大道
  { ...R(-76, -72, -14.6, 40), district: 'commerce' }, // 西二街
  { ...R(35, 86, -18, -14.6), district: 'leisure' }, // 星光大道
  { ...R(80, 84, -14.6, 40), district: 'leisure' }, // 乐园街
  { ...R(-86, 86, 40, 46), district: 'plaza' }, // 滨河步道
  { ...R(-35, -31, 26, 40), district: 'commerce' }, // 西环南延
  { ...R(31, 35, 26, 40), district: 'leisure' }, // 东环南延
  { ...R(-2, 2, 26, 40), district: 'plaza' }, // 中轴南延
  { ...R(-35, -31, -50, -26), district: 'expansion' },
  { ...R(31, 35, -50, -26), district: 'expansion' },
  { ...R(-87, 87, -52, -48), district: 'expansion' }, // 北环主路
  ...[-58,0,58].map(x=>({ ...R(x-2,x+2,-64,-28), district:'expansion' as const })),
  { ...R(-87,87,-55,-53), district:'expansion' },
  { ...R(-87,87,-47,-45), district:'expansion' },
  { ...R(-71, -57, -20, -5), district: 'commerce' }, // 西街集市口袋广场
  { ...R(57, 71, -20, -5), district: 'leisure' }, // 星光乐园广场
  { ...R(-68, -56, 36, 40), district: 'commerce' }, // 河港码头前场
  { ...R(56, 68, 36, 40), district: 'leisure' }, // 滨河观景台
  // 坊区小巷：东西巷接内环西/东街，南北巷通往滨河
  { ...R(-67.9, -35, 9.6, 11.6), district: 'commerce' }, // 南巷坊·坊巷
  { ...R(-56, -54, 0, 34), district: 'commerce' }, // 南巷坊·花巷
  { ...R(35, 74, 9.6, 11.6), district: 'leisure' }, // 霓虹坊·灯巷
  { ...R(56, 58, 0, 34), district: 'leisure' }, // 霓虹坊·星巷
];

/** 坊区口袋花园（草地，仅绘制；树在 TOWN_TREES） */
export const POCKET_GARDENS: Rect[] = [R(-12,-4,-44,-37),R(4,12,-44,-37),R(-12,-4,-63,-56),R(4,12,-63,-56),R(-66, -60, 19, 28), R(-50, -44, 19, 28), R(44, 52, 19, 30), R(62, 70, 19, 30)];

/** 河道：z 48..54 横贯南部，三座桥（西/中/东）对齐南延道路 */
export const RIVER = { minZ: 48, maxZ: 54 };
export const BRIDGES: [number, number][] = [[-35, -31], [-2, 2], [31, 35]];
export const RIVER_BOXES: Rect[] = (() => {
  const cuts = [-90, ...BRIDGES.flat(), 90];
  const out: Rect[] = [];
  for (let i = 0; i < cuts.length; i += 2) out.push(R(cuts[i], cuts[i + 1], RIVER.minZ, RIVER.maxZ));
  return out;
})();

/** 摊亭（小型实心） */
export const TOWN_KIOSKS: { x: number; z: number; w: number; d: number; district: DistrictId; color: string }[] = [
  // 西街集市：围绕据点，距入口 ≥4m
  { x: -69.5, z: -7.5, w: 2.4, d: 1.6, district: 'commerce', color: '#ff9f43' },
  { x: -64, z: -6.6, w: 2.4, d: 1.6, district: 'commerce', color: '#ff5f8f' },
  { x: -58.5, z: -7.5, w: 2.4, d: 1.6, district: 'commerce', color: '#ffd166' },
  // 南岸公园
  { x: -20, z: 59, w: 2.2, d: 1.6, district: 'plaza', color: '#ffd166' },
  { x: 20, z: 59, w: 2.2, d: 1.6, district: 'plaza', color: '#b18bff' },
];

/** 地标障碍（与渲染一致） */
export const TOWN_LANDMARK_BOXES: (Rect & { kind: string })[] = [
  { ...R(-56, -50, 35.5, 39.2), kind: 'containers' }, // 河港集装箱
  { ...R(-70, -66, 35.5, 37.5), kind: 'crates' },
  { ...R(61.5, 66.5, -28.5, -25.5), kind: 'wheel-base' }, // 摩天轮底座
  { ...R(52, 55, 35.5, 37.5), kind: 'pavilion-bench' },
];
export const TOWN_LANDMARK_CIRCLES: { x: number; z: number; r: number; kind: string }[] = [
  { x: 75, z: -5, r: 2.6, kind: 'carousel' },
  { x: -52, z: 33, r: 0.5, kind: 'crane' },
  { x: 72, z: 36.5, r: 1.6, kind: 'fountain' },
];

/** 外区树（碰撞） */
export const TOWN_TREES: [number, number][] = [
  ...[-86,-70,-46,-20,20,46,70,86].map(x=>[x,-35] as [number,number]),
  [-8,-40],[8,-40],[-8,-60],[8,-60],[-38,-56],[38,-56],
  ...[-80, -58, -45, -15, 15, 45, 58, 80].map(x => [x, 38] as [number, number]),
  ...[-70, -50, -30, -12, 12, 30, 50, 70].map(x => [x, 57] as [number, number]),
  ...[-60, -40, 40, 60].map(x => [x, 63] as [number, number]),
  [-62, -2], [60, 2], [-40, 32], [40, 32], [-20, 34], [16, 34],
  // 口袋花园
  [-62.5, 23], [-63.5, 27], [-47.5, 22], [-46, 27], [47, 24], [48.5, 29], [66, 25], [64, 29.5],
];

/** 北环南缘保留的两处建设地块（仅地面划线） */
export const EXPANSION_PLOTS: Rect[] = [R(-55,-40,-34,-29),R(40,55,-34,-29)];

/** 细立柱（灯串杆、桥栏柱）：渲染与碰撞同源 */
export const TOWN_POSTS: { x: number; z: number; r: number }[] = [
  ...SPORTS_POSTS,
  { x: -71, z: -4.6, r: 0.08 }, { x: -57, z: -4.6, r: 0.08 }, // 西街集市灯串
  { x: 56, z: 36, r: 0.08 }, { x: 68, z: 36, r: 0.08 }, // 滨河灯笼串
  ...BRIDGES.flatMap(([a, b]) => [a + 0.06, b - 0.06].flatMap(x => [RIVER.minZ, (RIVER.minZ + RIVER.maxZ) / 2, RIVER.maxZ].map(z => ({ x, z, r: 0.06 })))),
];
