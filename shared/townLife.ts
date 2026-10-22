/** 街边停靠物：渲染和碰撞共用，不占店门、主街或导航终点。 */
export const TOWN_VEHICLES = [
  {x:-74,z:-55,color:'#56b9b0',van:true},{x:-46,z:-55,color:'#e8ac65',van:true},
  {x:46,z:-55,color:'#8e85cb',van:false},{x:74,z:-55,color:'#dc779a',van:false},
  { x: -27, z: 21, color: '#49bcae', van: true },
  { x: 28, z: 21, color: '#c789bd', van: false },
  { x: -31, z: -20, color: '#e5b261', van: true },
  { x: 51, z: 30, color: '#779ed0', van: true },
  { x: -51, z: 30, color: '#d98179', van: false },
];
export const TOWN_CRATES = [{x:-71,z:-55},{x:-70,z:-55},{x:-43,z:-55},{x:-42,z:-55},{x:-29.5,z:20.3},{x:-29.5,z:21.5},{x:-33.5,z:-19.5},{x:53.5,z:30}];
export const TOWN_WALKERS = [
  {a:-83,b:-62,z:-46},{a:-51,b:-12,z:-46},{a:12,b:51,z:-46},{a:62,b:83,z:-46},
  {a:-9,b:-3,z:29.7}, {a:3,b:9,z:29.7},
  {a:-6,b:6,z:12.4}, {a:-6,b:6,z:22.8},
  {a:-28,b:-12,z:11.2}, {a:-28,b:-12,z:12.2},
  {a:12,b:28,z:11.2}, {a:12,b:28,z:12.2},
  {a:-23,b:-4,z:22}, {a:4,b:24,z:22},
  {a:-25,b:-14,z:-22}, {a:14,b:30,z:-22},
];
