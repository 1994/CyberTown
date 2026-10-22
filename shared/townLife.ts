/** 街边停靠物：渲染和碰撞共用，不占店门、主街或导航终点。 */
export const TOWN_VEHICLES = [
  { x: -27, z: 21, color: '#49bcae', van: true },
  { x: 28, z: 21, color: '#c789bd', van: false },
  { x: -31, z: -20, color: '#e5b261', van: true },
  { x: 51, z: 30, color: '#779ed0', van: true },
  { x: -51, z: 30, color: '#d98179', van: false },
];
export const TOWN_CRATES = [{x:-29.5,z:20.3},{x:-29.5,z:21.5},{x:-33.5,z:-19.5},{x:53.5,z:30}];
export const TOWN_WALKERS = [
  {a:-6,b:6,z:12.4}, {a:-6,b:6,z:22.8},
  {a:-28,b:-12,z:11.2}, {a:-28,b:-12,z:12.2},
  {a:12,b:28,z:11.2}, {a:12,b:28,z:12.2},
  {a:-23,b:-4,z:22}, {a:4,b:24,z:22},
  {a:-25,b:-14,z:-22}, {a:14,b:30,z:-22},
];
