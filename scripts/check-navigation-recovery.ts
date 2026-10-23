import assert from 'node:assert/strict';
import { findPath, blockedAt, moveWithCollision, WALK_SPEED } from '../shared/world.ts';
import { TOWN_DESTINATIONS } from '../shared/townPlan.ts';
import { NavigationRecovery } from '../shared/navigationRecovery.ts';
import { touchesVehicle } from '../shared/trafficCollision.ts';

// Follow the actual frame-sized movement, including waypoint acceptance. The old
// 12 cm acceptance could cut inside the safety margin at a smoothed corner.
let count = 0;
for (const start of Object.values(TOWN_DESTINATIONS)) for (const end of Object.values(TOWN_DESTINATIONS)) {
  const path = findPath(start.x,start.z,end.x,end.z);
  assert.ok(path?.length);
  let x=start.x,z=start.z, frames=0;
  while (path.length && frames++ < 18000) {
    const [tx,tz]=path[0], d=Math.hypot(tx-x,tz-z);
    if(d<.005){path.shift();continue;}
    const step=Math.min(WALK_SPEED/30,d);
    [x,z]=moveWithCollision(x,z,(tx-x)/d*step,(tz-z)/d*step);
  }
  assert.equal(path.length,0,`stalled ${start.name} → ${end.name} at ${x},${z}`);
  assert.ok(Math.hypot(x-end.x,z-end.z)<1,`wrong destination ${end.name}`);
  count++;
}
const car={x:0,z:-50,yaw:Math.PI/2,scale:.65};
for(const radius of [.4,1.3]){
  const blocked=(x:number,z:number,r:number)=>touchesVehicle(x,z,r+.15,car);
  const path=findPath(-12,-50,12,-50,{radius,blocked});
  assert.ok(path?.length);
  let prev:[number,number]=[-12,-50];
  for(const p of path){
    const n=Math.ceil(Math.hypot(p[0]-prev[0],p[1]-prev[1])/.025);
    for(let i=1;i<=n;i++){
      const x=prev[0]+(p[0]-prev[0])*i/n,z=prev[1]+(p[1]-prev[1])*i/n;
      assert.ok(!blocked(x,z,radius)&&!blockedAt(x,z,radius),'detour clips car/building');
    }
    prev=p;
  }
  assert.deepEqual(path.at(-1),[12,-50]);
}
const recovery=new NavigationRecovery(), path:[number,number][]=[[10,0]];
assert.equal(recovery.update(path,0,0,0),false);
for(let i=1;i<8;i++)assert.equal(recovery.update(path,0,0,.1),false);
assert.equal(recovery.update(path,0,0,.11),true,'stationary player must retry');
for(let i=1;i<80;i++)assert.equal(recovery.update(path,i*.1,0,.1),false,'normal walking must not replan');
assert.equal(recovery.update(null,8,0,5),false,'manual cancel must not revive route');
console.log(`Navigation recovery passed: ${count} frame-simulated cross-town routes, pedestrian/bicycle vehicle detours, stall/cancel checks`);
// Reproduce a head-on deadlock: car yields, walker keeps aiming through it.
// Recovery starts right at the car's contact boundary, not an ideal open start.
let route=findPath(-8,-50,8,-50)!;
const monitor=new NavigationRecovery();
let x=-8,z=-50,replans=0;
for(let f=0;route.length&&f<1800;f++){
  const [tx,tz]=route[0],d=Math.hypot(tx-x,tz-z);
  if(d<.005){route.shift();continue;}
  const step=Math.min(WALK_SPEED/60,d);
  const [nx,nz]=moveWithCollision(x,z,(tx-x)/d*step,(tz-z)/d*step);
  if(!touchesVehicle(nx,nz,.4,car)){x=nx;z=nz;}
  if(monitor.update(route,x,z,1/60)){
    const next=findPath(x,z,8,-50,{blocked:(a,b,r)=>touchesVehicle(a,b,r+.15,car)});
    if(next)route.splice(0,route.length,...next);
    replans++;
  }
}
assert.equal(route.length,0,'head-on yielding traffic must recover');
assert.ok(replans>0&&replans<5,'recovery should be throttled and converge');
console.log('Stationary yielding-car deadlock recovered without collision or teleport');
