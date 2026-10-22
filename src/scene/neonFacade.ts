import { BufferGeometry, Color, Float32BufferAttribute } from 'three';

/** Thin facade inlays need only their outward faces, not six-sided solid boxes.
 * One vertex-colored geometry per facade preserves every window's authored tint. */
export function makeNeonFacade(w: number, d: number, height: number, index: number, accent: string) {
  const positions: number[] = [], colors: number[] = [];
  const recessPositions: number[] = [];
  const tint = new Color();
  const quad = (out: number[], cx: number, y: number, cz: number, width: number, h: number, face: number) => {
    // face 0/1: front/back, 2/3: right/left. Cross product always points outward.
    const sx = face === 0 ? 1 : face === 1 ? -1 : 0;
    const sz = face === 2 ? -1 : face === 3 ? 1 : 0;
    for (const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]])
      out.push(cx+sx*u*width/2, y+v*h/2, cz+sz*u*width/2);
  };
  const floors = Math.max(0, Math.floor((height-5)/1.45));
  for (const side of [-1,1]) for (let f=0;f<floors;f++) {
    const y=4.8+f*1.45;
    quad(recessPositions,0,y,side*(d*.455+.0125),w*.84,1.1,side>0?0:1);
    for(let k=0;k<5;k++) {
      quad(positions,(k-2)*w*.16,y,side*(d*.46+.0125),w*.09,.65,side>0?0:1);
      tint.set((k+f+index)%5===0?accent:'#ffddb3').multiplyScalar((k*3+f+index)%7===0?.15:.65);
      for(let v=0;v<6;v++) colors.push(tint.r,tint.g,tint.b);
    }
    quad(positions,side*(w*.452+.0125),y,0,d*.8,.18,side>0?2:3);
    tint.set((f+index)%3===0?accent:'#91bad8').multiplyScalar(.5);
    for(let v=0;v<6;v++) colors.push(tint.r,tint.g,tint.b);
  }
  const geometry = (p:number[]) => {
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));
    g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
  };
  const windows=geometry(positions), recess=geometry(recessPositions);
  windows.setAttribute('color',new Float32BufferAttribute(colors,3));
  return {windows,recess};
}
