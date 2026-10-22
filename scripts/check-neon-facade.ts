import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { makeNeonFacade } from '../src/scene/neonFacade.ts';
import { TOWN_SHOPHOUSES } from '../shared/townPlan.ts';
let beforeTriangles=0,afterTriangles=0,oldMeshes=0;
for(const [i,h] of TOWN_SHOPHOUSES.filter(h=>h.z===-60&&h.x>=16).entries()){
 const f=makeNeonFacade(h.w,h.d,h.h,i,'#45e7ff');
 for(const g of [f.windows,f.recess]){
  const p=g.getAttribute('position'),n=g.getAttribute('normal');
  assert.ok(g.boundingSphere && Number.isFinite(g.boundingSphere.radius));
  for(let v=0;v<p.count;v++){
   const point=new Vector3().fromBufferAttribute(p,v),normal=new Vector3().fromBufferAttribute(n,v);
   assert.ok(Number.isFinite(point.x+point.y+point.z));
   assert.ok(Math.abs(point.x)<=h.w/2 && Math.abs(point.z)<=h.d/2 && point.y>0 && point.y<h.h);
   assert.ok(normal.x*point.x+normal.z*point.z>0,'facade face points inward');
  }
  afterTriangles+=p.count/3;
 }
 assert.equal(f.windows.getAttribute('color').count,f.windows.getAttribute('position').count);
 const floors=Math.floor((h.h-5)/1.45);oldMeshes+=floors*14;beforeTriangles+=floors*14*12;
 f.windows.dispose();f.recess.dispose();
}
assert.ok(afterTriangles<=beforeTriangles/6);
console.log(JSON.stringify({facadeTriangles:{before:beforeTriangles,after:afterTriangles},facadeMeshNodes:{before:oldMeshes,after:14},note:'Facade only; existing static batching already reduced old draw calls. Not a whole-scene FPS claim.'},null,2));
