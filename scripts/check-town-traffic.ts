import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TRAFFIC_ROUTES,trafficLoopLength,trafficPose} from '../shared/townTraffic.ts';
import {blockedAt} from '../shared/world.ts';

test('traffic loops remain continuous at turns and at the loop seam',()=>{
 for(const route of TRAFFIC_ROUTES){
  const length=trafficLoopLength(route);
  for(let d=0;d<=length;d+=.1){
   const a=trafficPose(route,d),b=trafficPose(route,d+.02);
   assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<=.020001);
  }
  const start=trafficPose(route,0),end=trafficPose(route,length);
  assert.ok(Math.hypot(start.x-end.x,start.z-end.z)<1e-8);
 }
});

test('moving vehicle footprint clears buildings, parked vans, trees and lamps',()=>{
 for(const route of TRAFFIC_ROUTES){
  for(let d=0;d<trafficLoopLength(route);d+=.25){
   const p=trafficPose(route,d);
   for(const forward of [-1.91*route.scale,0,1.91*route.scale])for(const side of [-.96*route.scale,.96*route.scale]){
    const x=p.x+forward*Math.sin(p.yaw)+side*Math.cos(p.yaw);
    const z=p.z+forward*Math.cos(p.yaw)-side*Math.sin(p.yaw);
    assert.equal(blockedAt(x,z,.08),false,`${route.id} intersects scenery at ${x},${z}`);
   }
  }
 }
});
