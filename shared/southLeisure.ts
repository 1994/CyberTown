/** South leisure props share their footprints with navigation/collision. */
export const SOUTH_STANDS = [{x:37,z:34,w:2.4,d:6.4}];
export const SOUTH_PLANTERS = [
 {x:-7,z:36,w:3,d:1},{x:-7,z:41,w:3,d:1},
 {x:6,z:36,w:2,d:1},{x:10,z:41,w:3,d:1},
 {x:38,z:29,w:3,d:1},{x:38,z:39,w:3,d:1},
];
export const SOUTH_BIKE_RACK = {x:10,z:34,w:3.2,d:1.8};
export const SOUTH_BOXES = [...SOUTH_STANDS,...SOUTH_PLANTERS,SOUTH_BIKE_RACK].map(p=>({minX:p.x-p.w/2,maxX:p.x+p.w/2,minZ:p.z-p.d/2,maxZ:p.z+p.d/2}));
