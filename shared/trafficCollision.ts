/** Vehicle dimensions include wheels, bumpers and a small safety margin. */
export interface VehiclePose { x:number; z:number; yaw:number; scale:number }
export function touchesVehicle(x:number,z:number,r:number,p:VehiclePose) {
 const dx=x-p.x,dz=z-p.z;
 const forward=dx*Math.sin(p.yaw)+dz*Math.cos(p.yaw);
 const side=dx*Math.cos(p.yaw)-dz*Math.sin(p.yaw);
 return Math.hypot(Math.max(0,Math.abs(forward)-2.05*p.scale),Math.max(0,Math.abs(side)-1.06*p.scale))<r;
}
export function bikeSamples(x:number,z:number,yaw:number) {
 return [-.76,0,.76].map(d=>({x:x+Math.sin(yaw)*d,z:z+Math.cos(yaw)*d,r:.43}));
}
