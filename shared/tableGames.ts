/** Independent demo rules and geometry, deliberately unrelated to town currency. */
export type TableGame = 'coin' | 'shell';
export type Phase = 'toss'|'hammer'|'strike'|'flip'|'settle'|'shuffle'|'pick'|'reveal'|'payout'|'loss'|'result';
export type V3 = [number,number,number];
export const TABLE = { initial:2000, minBet:10, maxBet:1000, step:10, coinRadius:.16, coinThickness:.06, heroRadius:.4, heroThickness:.10, landingRadius:.8, flightHeight:5.8, flightSeconds:3.15, settleSeconds:.65, swaps:18, swapSeconds:.1, cupRadius:.48, cupSpacing:1.55, bypass: 1.12, stackStep:.085, tossSeconds:1.65, returnDuration:1.65, returnStagger:.19, hand:[-1.35,.22,2.7] as V3 } as const;
export interface Round { id:string; game:TableGame; phase:Phase; at:number; opening:number; bet:number; face:0|1; outcome:0|1; swaps:[number,number][]; picked:number|null; win:boolean|null; credited:number; count:number; }
export interface DemoWallet { version:1; balance:number; round:Round|null; }
export const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
export const ease=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t);};
export function validBet(value:number,balance:number){return Number.isInteger(value)&&value>=10&&value<=1000&&value%10===0&&value<=balance;}
export function award(bet:number,won:boolean){return won?bet*2:0;}
export function visualCount(bet:number){return Math.min(10,6+Math.floor(bet/250));}
export function makeSwaps(random:()=>number):[number,number][]{return Array.from({length:TABLE.swaps},()=>{const a=Math.floor(random()*3);const b=(a+1+Math.floor(random()*2))%3;return [a,b];});}
export function shellFrame(swaps:[number,number][],seconds:number){
 const slots=[0,1,2];const completed=Math.min(swaps.length,Math.floor(Math.max(0,seconds)/TABLE.swapSeconds));
 for(let i=0;i<completed;i++){const [a,b]=swaps[i];[slots[a],slots[b]]=[slots[b],slots[a]];}
 const positions:V3[]=slots.map(slot=>[(slot-1)*TABLE.cupSpacing,0,0]);
 if(completed<swaps.length){const [a,b]=swaps[completed];const p=ease((seconds-completed*TABLE.swapSeconds)/TABLE.swapSeconds);const xa=positions[a][0],xb=positions[b][0]; positions[a]=[xa+(xb-xa)*p,0,Math.sin(Math.PI*p)*TABLE.bypass];positions[b]=[xb+(xa-xb)*p,0,-Math.sin(Math.PI*p)*TABLE.bypass];}
 return {slots,positions,coreSlot:slots[1]};
}
export function coinSupport(rx:number,rz=0,radius:number=TABLE.heroRadius,thickness:number=TABLE.heroThickness){const vertical=Math.abs(Math.cos(rx)*Math.cos(rz));return thickness*.5*vertical+radius*Math.sqrt(Math.max(0,1-vertical*vertical));}
export function heroFrame(seconds:number,outcome:0|1){const p=clamp01(seconds/TABLE.flightSeconds);const rotation=(8+outcome)*Math.PI*ease(p);return {rotation,y:TABLE.heroThickness/2+4*TABLE.flightHeight*p*(1-p)};}
export function settledHero(seconds:number,outcome:0|1){const p=clamp01(seconds/TABLE.settleSeconds);const wobble=Math.sin(p*Math.PI*6)*(1-p)*.38;const rx=outcome*Math.PI+wobble;return {rotation:rx,y:coinSupport(rx)+Math.sin(Math.PI*p)*.18*(1-p)};}
export function tableStack(i:number):V3{return [1.55+(i%2)*.40,.04+Math.floor(i/4)*TABLE.stackStep,-1.65+Math.floor((i%4)/2)*.4];}
// Flat catch pads occupy the centre of a broad palm; fingers are beyond z=-.75.
export function catchPad(i:number):V3 {return [(i%2===0?-.25:.25),.20+TABLE.coinThickness/2+Math.floor(i/4)*TABLE.stackStep,(Math.floor(i/2)%2===0?-.25:.25)];}
export function handWorld(local:V3):V3{return local.map((v,i)=>v+TABLE.hand[i]) as V3;}
export function arc(from:V3,to:V3,p:number,height:number,lane=0):V3{const t=clamp01(p);return [from[0]+(to[0]-from[0])*t+Math.sin(Math.PI*t)*lane,from[1]+(to[1]-from[1])*t+4*height*t*(1-t),from[2]+(to[2]-from[2])*t];}
export function returnOrder(count:number){return Array.from({length:count},(_,i)=>i).sort((a,b)=>Math.floor(b/4)-Math.floor(a/4)||a%4-b%4);}
export function returnFrame(i:number,seconds:number,count:number){const source=returnOrder(count)[i];const p=clamp01((seconds-i*TABLE.returnStagger)/TABLE.returnDuration);return {p,source,position:arc(tableStack(source),handWorld(catchPad(i)),ease(p),1.45+(i%4)*.16,(i%4-1.5)*.13),rotation:Math.PI*4*(1-ease(Math.min(1,p/.7)))};}
export function creditThrough(wallet:DemoWallet,n:number):DemoWallet {const r=wallet.round;if(!r||r.phase!=='payout'||!r.win)return wallet;const through=Math.min(r.count*2,Math.max(r.credited,Math.floor(n)));const before=Math.floor(award(r.bet,true)*r.credited/(r.count*2));const after=Math.floor(award(r.bet,true)*through/(r.count*2));return {...wallet,balance:wallet.balance+after-before,round:{...r,credited:through}};}
export function startRound(wallet:DemoWallet,game:TableGame,bet:number,face:0|1,id:string,random:()=>number,now:number):DemoWallet {if(wallet.round&&wallet.round.phase!=='result'||!validBet(bet,wallet.balance))return wallet;return {version:1,balance:wallet.balance-bet,round:{id,game,phase:'toss',at:now,opening:wallet.balance,bet,face,outcome:random()<.5?0:1,swaps:makeSwaps(random),picked:null,win:null,credited:0,count:visualCount(bet)}};}
