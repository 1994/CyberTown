import assert from 'node:assert/strict';
import { basketballFrame, BASKETBALL, RIDE_SPEED, SHOPPING_STORES, BIKE_STAND } from '../shared/townActivities.ts';
import { blockedAt, findPath, SPAWNS, WALK_SPEED, moveWithCollision } from '../shared/world.ts';
import { TOWN_DESTINATIONS } from '../shared/townPlan.ts';
for(const goal of [...SHOPPING_STORES,BIKE_STAND,TOWN_DESTINATIONS.basketball])for(const start of Object.values(SPAWNS)){
 const path=findPath(...start,goal.x,goal.z);assert.ok(path?.length);const end=path.at(-1)!;assert.ok(Math.hypot(end[0]-goal.x,end[1]-goal.z)<1);let p=start;
 for(const next of path){const n=Math.ceil(Math.hypot(next[0]-p[0],next[1]-p[1])/.05);for(let j=1;j<=n;j++)assert.ok(!blockedAt(p[0]+(next[0]-p[0])*j/n,p[1]+(next[1]-p[1])*j/n));p=next;}
}
let last=basketballFrame(0);
for(let t=.01;t<=36;t+=.01){const f=basketballFrame(t);assert.ok(Math.hypot(...f.ball.map((v,i)=>v-last.ball[i]))<.16,`ball teleports at ${t}`);for(const p of f.players)assert.ok(!blockedAt(BASKETBALL.x+p[0],BASKETBALL.z+p[2]),`NPC intersects prop at ${t}`);assert.ok(f.ball[1]>=.2);last=f;}
assert.ok(RIDE_SPEED>WALK_SPEED&&RIDE_SPEED<7.5);
// Bike uses normal substep collision; fast movement cannot tunnel through shop frontage.
let p:[number,number]=[-26,12.3];for(let i=0;i<100;i++)p=moveWithCollision(...p,0,RIDE_SPEED*.05);
assert.ok(!blockedAt(...p));assert.ok(p[1]<13.8);
console.log('Activities: all spawns reach shop/bike/court; 2 continuous possessions; NPC obstacle clearance; bicycle speed and collision passed.');
