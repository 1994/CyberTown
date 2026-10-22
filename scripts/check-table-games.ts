import assert from 'node:assert/strict';
import {TABLE,award,startRound,creditThrough,returnFrame,returnOrder,catchPad,shellFrame,makeSwaps,heroFrame,settledHero,coinSupport,visualCount,type DemoWallet} from '../shared/tableGames.ts';
const base:DemoWallet={version:1,balance:2000,round:null};
for(const bet of [10,50,100,500,1000]){
 let w=startRound(base,'coin',bet,0,'one',()=>.1,1);assert.equal(w.balance,2000-bet);assert.equal(startRound(w,'coin',bet,0,'two',()=>.9,2),w);
 w={...w,round:{...w.round!,phase:'payout',win:true}};const n=w.round!.count*2;
 for(let i=0;i<=n;i++){w=creditThrough(w,i);assert.equal(w.balance,2000-bet+Math.floor(bet*2*i/n));assert.deepEqual(creditThrough(w,i),w);}
 assert.equal(w.balance,2000+bet);assert.equal(award(bet,false),0);
}
for(const bet of [0,11,1010,2010,NaN])assert.equal(startRound(base,'coin',bet,0,'x',()=>0,1),base);
assert.equal(visualCount(1000)*2,20);
let seed=41;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
for(let round=0;round<100;round++){
 const swaps=makeSwaps(random);assert.equal(swaps.length,18);let last=shellFrame(swaps,0);
 for(let t=.001;t<1.801;t+=.001){const f=shellFrame(swaps,t);for(let i=0;i<3;i++){assert.ok(Math.hypot(...f.positions[i].map((v,k)=>v-last.positions[i][k]))<.08);for(let j=i+1;j<3;j++)assert.ok(Math.hypot(...f.positions[i].map((v,k)=>v-f.positions[j][k]))>=TABLE.cupRadius*2,`cups intersect ${round} ${t}`);}last=f;}
 assert.deepEqual([...last.slots].sort(),[0,1,2]);assert.equal(last.coreSlot,last.slots[1]);
}
for(const face of [0,1] as const){const f=heroFrame(TABLE.flightSeconds,face);assert.ok(Math.abs(Math.cos(f.rotation)-(face===0?1:-1))<1e-8);assert.equal(heroFrame(TABLE.flightSeconds/2,face).y,TABLE.flightHeight+.05);for(let t=0;t<=.65;t+=.002){const q=settledHero(t,face);assert.ok(q.y>=coinSupport(q.rotation)-1e-10);}}
const order=returnOrder(20);for(let i=0;i<20;i++)for(let j=i+1;j<20;j++)if(order[i]%4===order[j]%4)assert.ok(order[i]>order[j]);
for(let i=0;i<20;i++){const p=catchPad(i);assert.ok(Math.abs(p[0])+TABLE.coinRadius<.56);assert.ok(Math.abs(p[2])+TABLE.coinRadius<.57);assert.ok(p[1]-TABLE.coinThickness/2>=.2);const end=returnFrame(i,20,20);assert.equal(end.rotation,0);assert.equal(end.p,1);}
let nearest=Infinity;
for(let t=0;t<5.6;t+=.003){const f=Array.from({length:20},(_,i)=>returnFrame(i,t,20));for(let i=0;i<20;i++)for(let j=i+1;j<20;j++){
 const a=f[i],b=f[j];const d=Math.hypot(...a.position.map((v,k)=>v-b.position[k]));
 if(a.p>0&&a.p<1&&b.p>0&&b.p<1){nearest=Math.min(nearest,d);assert.ok(d>TABLE.coinRadius*2,`air coins intersect: ${i}/${j} at ${t.toFixed(3)} distance ${d}`);}
}}
// Actual cylinder vertical support during departure and landing; catch plane and glove bounds.
for(let t=0;t<5.6;t+=.002){for(let i=0;i<20;i++){const f=returnFrame(i,t,20);if(f.p<=0||f.p>=1)continue;const support=coinSupport(f.rotation,0,TABLE.coinRadius,TABLE.coinThickness);
 assert.ok(f.position[1]-support>0,'return coin clips table');
 const local=f.position.map((v,k)=>v-TABLE.hand[k]);
 if(Math.abs(local[0])<.625+TABLE.coinRadius&&Math.abs(local[2])<.65+TABLE.coinRadius)assert.ok(local[1]-support>=.2-1e-8,'return coin clips palm');
 if(local[2]<-.6&&local[2]>-1.2&&Math.abs(local[0])<.65)assert.ok(local[1]-support>.19,'return coin clips fingers');
 assert.ok(!(Math.abs(local[0])<.64&&local[2]>.68&&local[1]-support<.17),'return coin clips cuff');
}}

console.log('Table games: exact debit/2x payout/idempotent credit; 100 continuous 18-swap rounds; face/support geometry; 20-coin catch pads and aerial clearance passed',nearest);
