/** Ambient traffic stays on dedicated road lanes; it never changes navigation. */
export const TRAFFIC_ROUTES = [
  {id:'north-ring',left:-82,right:82,z:-50,radius:.8,cars:5,speed:3.4,scale:.65},
  { id: 'commerce-street', left: -27, right: -12, z: 11.2, radius: .55, cars: 2, speed: 2.2, scale: .55 },
  { id: 'leisure-street', left: 12, right: 26, z: 11.2, radius: .55, cars: 2, speed: 2.2, scale: .55 },
  { id: 'promenade', left: -22, right: 22, z: 24.15, radius: .85, cars: 4, speed: 3.2, scale: .65 },
  { id: 'west-avenue', left: -82, right: -40, z: -16.3, radius: .8, cars: 2, speed: 3.8, scale: .65 },
  { id: 'east-avenue', left: 40, right: 82, z: -16.3, radius: .8, cars: 2, speed: 3.5, scale: .65 },
] as const;
export type TrafficRoute = typeof TRAFFIC_ROUTES[number];
export function trafficPose(route: TrafficRoute, distance: number) {
 const straight=route.right-route.left, arc=Math.PI*route.radius;
 const length=2*(straight+arc);
 let d=((distance%length)+length)%length;
 if(d<straight)return {x:route.left+d,z:route.z-route.radius,yaw:Math.PI/2};
 d-=straight;
 if(d<arc){const angle=-Math.PI/2+d/route.radius;return {x:route.right+Math.cos(angle)*route.radius,z:route.z+Math.sin(angle)*route.radius,yaw:-angle};}
 d-=arc;
 if(d<straight)return {x:route.right-d,z:route.z+route.radius,yaw:-Math.PI/2};
 d-=straight;
 const angle=Math.PI/2+d/route.radius;
 return {x:route.left+Math.cos(angle)*route.radius,z:route.z+Math.sin(angle)*route.radius,yaw:-angle};
}
export const trafficLoopLength=(r:TrafficRoute)=>2*(r.right-r.left+Math.PI*r.radius);
