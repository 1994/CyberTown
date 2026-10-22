/** Public outdoor activities; positions shared by map, scenery and interaction. */
export const SHOPPING = { x: -26.8, z: 10.5, range: 2.3 };
export const SHOPPING_STORES = [
 {...SHOPPING,category:'shirt'},
 {x:-21.6,z:10.5,range:2.3,category:'accessory'},
 {x:-15,z:12.3,range:2.3,category:'vehicle'},
] as const;
export const BIKE_STAND = { x: -12, z: 17, yaw: Math.PI / 2, range: 2.3 };
export const BASKETBALL = { x: 24, z: 34, width: 12, length: 14 };
export const RIDE_SPEED = 6.4; // below the server's 7.5m/s movement budget
export const SPORTS_BOXES = [
 {minX:18,maxX:30,minZ:26.25,maxZ:26.35},
 {minX:18,maxX:30,minZ:41.65,maxZ:41.75},
 {minX:16.35,maxX:17.25,minZ:32,maxZ:36},
];
export const SPORTS_POSTS = [
  { x: 24, z: 26.5, r: .18 }, { x: 24, z: 41.5, r: .18 },
  ...[18, 30].flatMap(x => [27, 34, 41].map(z => ({ x, z, r: .07 }))),
];
type P = [number, number, number];
const lerp = (a:P,b:P,t:number):P => a.map((v,i)=>v+(b[i]-v)*Math.max(0,Math.min(1,t))) as P;
const smooth = (t:number) => {const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
/** A continuous 18s possession: dribble → pass → drive → shot → rebound → pass back. */
export function basketballFrame(seconds:number) {
  const t=((seconds%18)+18)%18;
  const drive=smooth((t-4)/3)*(1-smooth((t-12)/4));
  const rebound=smooth((t-7)/3)*(1-smooth((t-13)/4));
  const players:P[]=[[-2,0,2],[2-drive,0,1-drive*3],[-2+rebound*2,0,-3-rebound*2],[.2+Math.sin(t*Math.PI/9)*1.2,0,-.7-drive*2]];
  const hand=(i:number,y=1.1):P=>[players[i][0]+.3,y,players[i][2]+.35];
  let ball:P;
  if(t<3) ball=hand(0,.3+.8*Math.abs(Math.cos(t*Math.PI*2)));
  else if(t<4) ball=lerp(hand(0),hand(1),(t-3));
  else if(t<7) ball=hand(1,.3+.8*Math.abs(Math.cos((t-4)*Math.PI*2)));
  else if(t<7.7) ball=lerp(hand(1),hand(1,2.1),(t-7)/.7);
  else if(t<9.7) {const u=(t-7.7)/2;ball=lerp(hand(1,2.1),[0,2.8,-6],u);ball[1]+=3.2*4*u*(1-u);}
  else if(t<10.5) ball=lerp([0,2.8,-6],[0,.25,-5.6],(t-9.7)/.8);
  else if(t<11.2) ball=lerp([0,.25,-5.6],hand(2),(t-10.5)/.7);
  else if(t<12.2) ball=hand(2);
  else if(t<13.7) ball=lerp(hand(2),hand(0),(t-12.2)/1.5);
  else ball=hand(0,1.1); // held until the next dribble starts
  return {players,ball,shooting:t>=7&&t<9.7,scored:t>=9.7&&t<11.2};
}
