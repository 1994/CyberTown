import { touchesVehicle, type VehiclePose, bikeSamples } from '../../shared/trafficCollision.ts';
import { blockedAt } from '../../shared/world.ts';
export const liveVehicles = new Map<string,VehiclePose>();
export function vehicleBlocked(x:number,z:number,r:number) {
 for(const p of liveVehicles.values()) if(touchesVehicle(x,z,r,p)) return true;
 return false;
}
export function riderBlocked(x:number,z:number,yaw:number) {
 return bikeSamples(x,z,yaw).some(p=>blockedAt(p.x,p.z,p.r)||vehicleBlocked(p.x,p.z,p.r));
}
