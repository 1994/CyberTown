// 园区地图：区域、出生点、碰撞体与寻路（前端使用；数值与 /api/world 的边界一致）。
// 坐标单位米，x 向东（右），z 向南（朝向默认镜头）。原办公室位于中心 [-8.5,8.5]×[-6,6]。

export const WORLD_BOUNDS = { minX: -30, maxX: 30, minZ: -22, maxZ: 22 };
export const PLAYER_RADIUS = 0.36;
export const WALK_SPEED = 4.2; // m/s（服务端有速度校验，前端不超过 4.6）
export const INTERACT_RANGE = 2.6; // 与同事互动距离
export const HIGHFIVE_RANGE = 4; // 与玩家碰杯距离（服务端同样校验 ≤4m）

export const SPAWNS: Record<string, [number, number]> = {
  wang: [0, 11],
  li: [2, 11],
  mei: [-2, 11],
  liu: [4, 11],
};

export interface Zone {
  id: string;
  name: string;
  icon: string;
  x: number;
  z: number;
  color: string;
}

export const ZONES: Zone[] = [
  { id: 'plaza', name: '共享广场', icon: '⛲', x: 0, z: 12, color: '#ffd166' },
  {
    id: 'office',
    name: '总部办公室',
    icon: '🏢',
    x: 0,
    z: 0,
    color: '#3ef0ff',
  },
  {
    id: 'coffee',
    name: '咖啡社交区',
    icon: '☕',
    x: -17,
    z: 0,
    color: '#ff8fb8',
  },
  {
    id: 'talent',
    name: '人才街',
    icon: '🧑‍💼',
    x: -16,
    z: -13,
    color: '#7dffa8',
  },
  {
    id: 'project',
    name: '小游戏俱乐部',
    icon: '🎮',
    x: 18,
    z: 0,
    color: '#e4aa65',
  },
  {
    id: 'garden',
    name: '露台花园',
    icon: '🌿',
    x: 18,
    z: -13,
    color: '#9be26a',
  },
];

/** 项目区里的「项目终端」：走过去按 E 也能接紧急项目 */
export const PROJECT_TERMINAL = { x: 18, z: 0.2 };

/** 人才街摊位：自由身同事站在摊位前等待招募（按同事顺序分配） */
export const BOOTHS: { x: number; z: number; face: number }[] = (() => {
  const list: { x: number; z: number; face: number }[] = [];
  const xs = [-25, -21, -17, -13, -9.5];
  xs.forEach((x) => list.push({ x, z: -10.9, face: 0 })); // 北侧摊位，面朝南
  xs.forEach((x) => list.push({ x: x + 1.6, z: -15.1, face: Math.PI })); // 南侧摊位，面朝北
  list.push({ x: -27.2, z: -13, face: Math.PI / 2 });
  list.push({ x: -6.6, z: -13, face: -Math.PI / 2 });
  // 第一位老板在广场迎接玩家，让开局就能体验标题里的身份反转。
  list[0] = { x: -2.3, z: 11.7, face: 0.5 };
  return list;
})();

/** 项目区的团队工位组：队伍主人离线时，他的队员坐在自己的工位组上办公 */
export const POD_ORDER = ['wang', 'li', 'mei', 'liu'];
export const PODS: { x: number; z: number }[] = [
  { x: 14, z: -3.6 },
  { x: 22.4, z: -3.6 },
  { x: 14, z: 4 },
  { x: 22.4, z: 4 },
];
export const POD_DESK_DX = [-2.2, 0, 2.2];
export function podSeat(
  ownerId: string,
  slot: number,
): { x: number; z: number } {
  const i = Math.max(0, POD_ORDER.indexOf(ownerId)) % PODS.length;
  const p = PODS[i];
  return { x: p.x + POD_DESK_DX[slot % 3], z: p.z - 0.8 };
}

// ───────────────────────── 碰撞体 ─────────────────────────

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface Circle {
  x: number;
  z: number;
  r: number;
}

const box = (minX: number, maxX: number, minZ: number, maxZ: number): Box => ({
  minX,
  maxX,
  minZ,
  maxZ,
});
const centered = (x: number, z: number, w: number, d: number): Box =>
  box(x - w / 2, x + w / 2, z - d / 2, z + d / 2);

/** 办公室门洞：后墙（通往人才街）与左墙（通往咖啡区），前侧与右侧开放 */
export const OFFICE_DOORS = {
  back: { minX: -5.4, maxX: -3.0 },
  left: { minZ: -1.4, maxZ: 1.4 },
};

export const BOXES: Box[] = [
  // ── 办公室 ──
  box(-8.6, OFFICE_DOORS.back.minX, -6.12, -5.88),
  box(OFFICE_DOORS.back.maxX, 3.9, -6.12, -5.88),
  box(-8.62, -8.38, -6, OFFICE_DOORS.left.minZ),
  box(-8.62, -8.38, OFFICE_DOORS.left.maxZ, 6),
  box(3.9, 8.5, -6, -4.6), // 电梯核心筒
  ...[-3.3, 0, 3.3].map((x) => centered(x, -1.25, 1.9, 0.96)), // 工位
  centered(4.9, 2.75, 2.3, 1.1), // 老板桌
  box(-2.55, -2.45, 0.45, 4.65), // 会议区玻璃隔断
  centered(-5.6, -4.4, 2.4, 1.0), // 沙发
  box(7.7, 8.5, -2.2, 0.4), // 咖啡吧
  box(7.6, 8.5, 0.4, 1.4), // 售货机
  centered(-0.6, 4.9, 0.8, 0.6), // 打印机
  // ── 咖啡社交区 ──
  centered(-22.5, -1, 4.2, 3.2), // 咖啡亭
  // ── 人才街摊位 ──
  ...[-25, -21, -17, -13, -9.5].map((x) => centered(x, -9.6, 2.6, 1.2)),
  ...[-25, -21, -17, -13, -9.5].map((x) => centered(x + 1.6, -16.4, 2.6, 1.2)),
  // ── 项目区工位组与大屏 ──
  ...PODS.flatMap((p) =>
    POD_DESK_DX.map((dx) => centered(p.x + dx, p.z, 1.9, 0.96)),
  ),
  centered(18, 0.2, 1.4, 0.9), // 项目终端
  box(27.6, 28.4, -5, 5), // LED 大屏
  // ── 露台花园 ──
  centered(18, -17.6, 6.5, 0.5), // 花廊座椅
  centered(13, -10, 3.2, 1.4), // 花坛
  centered(23.5, -10, 3.2, 1.4),
  // ── 广场长椅 ──
  centered(-5.2, 16.6, 2.0, 0.6),
  centered(5.2, 16.6, 2.0, 0.6),
  centered(-5.2, 9.0, 2.0, 0.6),
  centered(5.6, 8.6, 2.0, 0.6),
  // ── 路演舞台（东南） ──
  centered(22, 16.5, 7, 3),
];

export const CIRCLES: Circle[] = [
  // 办公室
  { x: -5.1, z: 2.55, r: 1.8 }, // 会议桌+椅
  { x: -5.6, z: -3.35, r: 0.5 },
  { x: -7.9, z: -5.4, r: 0.4 },
  { x: -7.9, z: 5.4, r: 0.4 },
  { x: 3.35, z: -5.45, r: 0.4 },
  { x: 7.9, z: 5.4, r: 0.4 },
  { x: -1.65, z: -1.15, r: 0.3 },
  { x: 1.65, z: -1.15, r: 0.3 },
  { x: 1.6, z: 4.9, r: 0.3 },
  // 广场喷泉
  { x: 0, z: 16, r: 2.2 },
  // 咖啡区圆桌
  { x: -15, z: 2.6, r: 0.75 },
  { x: -18.4, z: 3.8, r: 0.75 },
  { x: -14.2, z: -2.6, r: 0.75 },
  { x: -17.6, z: -3.6, r: 0.75 },
  // 露台花园水池
  { x: 18, z: -13.2, r: 2.4 },
];

/** 园区树木（装饰 + 碰撞） */
export const TREES: [number, number][] = [
  [-27, 8],
  [-22, 9],
  [-27, 15],
  [-21, 19],
  [-14, 20],
  [-12, 14],
  [-26, -20],
  [-20, -20],
  [-12, -20],
  [-6, -19],
  [-27, -6],
  [-27, 3],
  [-11, -6.5],
  [-11, 6.5],
  [11, 7.5],
  [11, -7],
  [27, 8],
  [27, -7],
  [12, 19],
  [27, 20],
  [11, -19],
  [16, -20],
  [21, -20],
  [26, -19],
  [27, -14],
  [10.5, -14],
  [-8, 20],
  [8, 20],
  [-3, -9],
  [3, -9],
  [7, -11],
  [-20, 13],
  [-16, 9],
];
for (const [x, z] of TREES) CIRCLES.push({ x, z, r: 0.45 });

/** 路灯（装饰 + 碰撞） */
export const LAMPS: [number, number][] = [
  [-9, 9.4],
  [9, 9.4],
  [-16, 9.4],
  [16, 9.4],
  [-24, 9.4],
  [24, 9.4],
  [-15.4, -6.5],
  [-15.4, 6],
  [16.6, -6.6],
  [16.6, 6.6],
  [-27, -12.2],
  [-5.8, -12.2],
  [12, -15],
  [24.5, -15],
  [-3, 20],
  [3, 20],
];
for (const [x, z] of LAMPS) CIRCLES.push({ x, z, r: 0.18 });

/** 主要步道（仅用于绘制地面与小地图） */
export const PATHS: Box[] = [
  box(-29, 29, 9.8, 12.6), // 东西主干道（经过广场）
  box(-18.4, -15.6, -14.6, 9.8), // 咖啡区—人才街—主干道 南北步道
  box(16.6, 19.4, -18, 9.8), // 项目区—花园—主干道 南北步道
  box(-28.5, -5.5, -14.4, -11.6), // 人才街街面
  box(-15.6, -8.5, -1.2, 1.2), // 办公室左门 → 咖啡区
  box(-5.4, -3, -11.6, -6), // 办公室后门 → 人才街
  box(8.5, 16.6, -1.2, 1.2), // 办公室右侧 → 项目区
  box(-1.5, 1.5, 6, 9.8), // 办公室前门 → 广场
];

// ───────────────────────── 碰撞与寻路 ─────────────────────────

export function blockedAt(x: number, z: number, r = PLAYER_RADIUS): boolean {
  const b = WORLD_BOUNDS;
  if (
    x < b.minX + 0.6 ||
    x > b.maxX - 0.6 ||
    z < b.minZ + 0.6 ||
    z > b.maxZ - 0.6
  )
    return true;
  for (const o of BOXES) {
    const cx = Math.max(o.minX, Math.min(x, o.maxX));
    const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  for (const c of CIRCLES) {
    const dx = x - c.x;
    const dz = z - c.z;
    const rr = c.r + r;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}

/** 带滑墙的移动：先整体位移，受阻则分别尝试 x / z 轴 */
export function moveWithCollision(
  x: number,
  z: number,
  dx: number,
  dz: number,
): [number, number] {
  if (!blockedAt(x + dx, z + dz)) return [x + dx, z + dz];
  if (dx && !blockedAt(x + dx, z)) return [x + dx, z];
  if (dz && !blockedAt(x, z + dz)) return [x, z + dz];
  // 被困（例如出生在碰撞体内）时允许离开
  if (blockedAt(x, z)) return [x + dx, z + dz];
  return [x, z];
}

const CELL = 0.5;
let grid: Uint8Array | null = null;
let GW = 0;
let GH = 0;

function buildGrid() {
  const b = WORLD_BOUNDS;
  GW = Math.round((b.maxX - b.minX) / CELL) + 1;
  GH = Math.round((b.maxZ - b.minZ) / CELL) + 1;
  grid = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      grid[j * GW + i] = blockedAt(
        b.minX + i * CELL,
        b.minZ + j * CELL,
        PLAYER_RADIUS + 0.12,
      )
        ? 1
        : 0;
    }
  }
}

const toCell = (x: number, z: number): [number, number] => [
  Math.round((x - WORLD_BOUNDS.minX) / CELL),
  Math.round((z - WORLD_BOUNDS.minZ) / CELL),
];
const toWorld = (i: number, j: number): [number, number] => [
  WORLD_BOUNDS.minX + i * CELL,
  WORLD_BOUNDS.minZ + j * CELL,
];
const free = (i: number, j: number) =>
  i >= 0 && j >= 0 && i < GW && j < GH && grid![j * GW + i] === 0;

function nearestFree(i: number, j: number): [number, number] | null {
  if (free(i, j)) return [i, j];
  for (let r = 1; r < 12; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (free(i + di, j + dj)) return [i + di, j + dj];
      }
    }
  }
  return null;
}

/** 视线检测：0.05m 步长 + 0.08m 安全余量，保证拉直后的路线不会擦进圆形/方形碰撞体 */
const LOS_MARGIN = 0.08;
function lineClear(ax: number, az: number, bx: number, bz: number): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d / 0.05));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    if (
      blockedAt(
        ax + (bx - ax) * t,
        az + (bz - az) * t,
        PLAYER_RADIUS + LOS_MARGIN,
      )
    )
      return false;
  }
  return true;
}

/** A* 寻路（8 方向，网格 0.5m），返回已拉直的折线（不含起点）。找不到返回 null。 */
export function findPath(
  sx: number,
  sz: number,
  tx: number,
  tz: number,
): [number, number][] | null {
  if (!grid) buildGrid();
  if (
    !blockedAt(tx, tz, PLAYER_RADIUS + LOS_MARGIN) &&
    lineClear(sx, sz, tx, tz)
  )
    return [[tx, tz]];
  const s = nearestFree(...toCell(sx, sz));
  const t = nearestFree(...toCell(tx, tz));
  if (!s || !t) return null;
  const N = GW * GH;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const si = s[1] * GW + s[0];
  const ti = t[1] * GW + t[0];
  g[si] = 0;
  // 二叉堆
  const heap: number[] = [si];
  const f = new Float32Array(N).fill(Infinity);
  const h = (i: number) => {
    const dx = Math.abs((i % GW) - t[0]);
    const dz = Math.abs(Math.floor(i / GW) - t[1]);
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  };
  f[si] = h(si);
  const push = (i: number) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (f[heap[p]] <= f[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.4142],
    [1, -1, 1.4142],
    [-1, 1, 1.4142],
    [-1, -1, 1.4142],
  ];
  let found = false;
  let iter = 0;
  while (heap.length && iter++ < 40000) {
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === ti) {
      found = true;
      break;
    }
    closed[cur] = 1;
    const ci = cur % GW;
    const cj = Math.floor(cur / GW);
    for (const [di, dj, cost] of dirs) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!free(ni, nj)) continue;
      if (di && dj && (!free(ci + di, cj) || !free(ci, cj + dj))) continue; // 不切角
      const n = nj * GW + ni;
      const ng = g[cur] + cost;
      if (ng < g[n]) {
        g[n] = ng;
        came[n] = cur;
        f[n] = ng + h(n);
        push(n);
      }
    }
  }
  if (!found) return null;
  const cells: [number, number][] = [];
  for (let c = ti; c !== -1; c = came[c])
    cells.push(toWorld(c % GW, Math.floor(c / GW)));
  cells.reverse();
  // 终点用真实目标（若可站立）
  const [lx, lz] = cells[cells.length - 1];
  if (
    !blockedAt(tx, tz, PLAYER_RADIUS + LOS_MARGIN) &&
    lineClear(lx, lz, tx, tz)
  )
    cells.push([tx, tz]);
  // 拉直：从当前点出发，尽量直连更远的点
  const out: [number, number][] = [];
  let ax = sx;
  let az = sz;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = cells.length - 1; m > k; m--) {
      if (lineClear(ax, az, cells[m][0], cells[m][1])) {
        far = m;
        break;
      }
    }
    out.push(cells[far]);
    [ax, az] = cells[far];
    k = far + 1;
  }
  return out;
}

export function zoneAt(x: number, z: number): Zone | null {
  let best: Zone | null = null;
  let bd = Infinity;
  for (const zn of ZONES) {
    const d = Math.hypot(zn.x - x, zn.z - z);
    if (d < bd) {
      bd = d;
      best = zn;
    }
  }
  return bd < 11 ? best : null;
}

export function clampToBounds(x: number, z: number): [number, number] {
  const b = WORLD_BOUNDS;
  return [
    Math.max(b.minX + 0.7, Math.min(b.maxX - 0.7, x)),
    Math.max(b.minZ + 0.7, Math.min(b.maxZ - 0.7, z)),
  ];
}
