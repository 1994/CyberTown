// 办公室布局（单位：米）。原点在地板中心，相机从 +x +z 斜俯视。
export const FLOOR = { minX: -8.5, maxX: 8.5, minZ: -6, maxZ: 6 };
export const WALL_H = 3.3;

export const DESK_SLOTS = [-3.3, 0, 3.3].map((x) => ({
  x,
  deskZ: -1.25,
  seatZ: -2.05,
}));

export const AISLE_Z = -3.35;

export const ELEVATOR = {
  x: 6.05,
  doorZ: -4.6,
  cabZ: -5.35,
  coreMinX: 3.9,
};

export const BOSS_DESK = { x: 4.9, z: 2.75, seatZ: 2.0 };
export const MEETING = { x: -5.1, z: 2.55 };
export const LOUNGE = { x: -5.6, z: -4.4 };

export type V2 = [number, number];

/** 从电梯到某工位座位的路径（x,z 折线） */
export function pathFromElevator(slot: number): V2[] {
  const d = DESK_SLOTS[slot];
  return [
    [ELEVATOR.x, ELEVATOR.cabZ],
    [ELEVATOR.x, ELEVATOR.doorZ + 0.4],
    [ELEVATOR.x - 0.4, AISLE_Z],
    [d.x, AISLE_Z],
    [d.x, d.seatZ - 0.05],
  ];
}

export function pathToElevator(slot: number): V2[] {
  return pathFromElevator(slot).slice().reverse();
}

export const DEFAULT_CAM = {
  pos: [14.2, 13.6, 16.8] as [number, number, number],
  target: [0.2, 0.3, -0.2] as [number, number, number],
};

export const MOBILE_CAM = {
  pos: [16.5, 18.5, 20.5] as [number, number, number],
  target: [0.2, 0.3, 0.2] as [number, number, number],
};
