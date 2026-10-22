import type { DemoWallet } from './tableGames.ts';
/** Free night-fishing demo. All amounts are independent trial currency. */
export const FISHING = {seconds:60, biteWindow:1.35, catchDistance:1.8} as const;
export const FISH = [
 {name:'霓虹小鲫',color:'#65f5de',value:40,weight:0.8,pull:.18,speed:.29},
 {name:'电光鲈鱼',color:'#f58ccf',value:90,weight:2.4,pull:.28,speed:.23},
 {name:'金鳞龙鱼',color:'#ffe080',value:180,weight:5.6,pull:.38,speed:.18},
] as const;
export type FishingPhase='ready'|'aim'|'wait'|'bite'|'reel'|'caught'|'escaped'|'result';
export interface FishingRound {id:string;phase:FishingPhase;started:number;at:number;aim:number;fish:number;progress:number;tension:number;held:boolean;catches:number[];message:string;}
export function newFishingRound(id:string,now:number):FishingRound{return {id,phase:'aim',started:now,at:now,aim:-3,fish:0,progress:0,tension:.18,held:false,catches:[],message:'左右移动鱼竿，松开下钩'};}
export const fishingReward=(catches:number[])=>catches.reduce((sum,i)=>sum+(FISH[i]?.value??0),0);
export const fishX=(i:number,t:number)=> (i-1)*3+Math.sin(t*.8+i)*.55;
export function castFishing(s:FishingRound,now:number):FishingRound{
 if(s.phase!=='aim')return s;
 const time=(now-s.started)/1000;
 const fish=[0,1,2].sort((a,b)=>Math.abs(fishX(a,time)-s.aim)-Math.abs(fishX(b,time)-s.aim))[0];
 return {...s,fish,phase:'wait',at:now,held:false,message:'鱼在靠近，等浮标沉下再提竿'};
}
export function pullFishing(s:FishingRound,now:number):FishingRound{
 if(s.phase==='bite')return {...s,phase:'reel',at:now,held:true,progress:.08,tension:.18,message:'按住收线，鱼挣扎时松手'};
 if(s.phase==='wait')return {...s,phase:'escaped',at:now,held:false,message:'提早了！等浮标猛沉再提竿'};
 return s.phase==='reel'?{...s,held:true}:s;
}
export const fishStruggling=(seconds:number,fish:number)=>Math.sin(seconds*3.3+fish)>.15;
export function tickFishing(s:FishingRound,now:number,dt:number):FishingRound{
 if(s.phase==='ready'||s.phase==='result')return s;
 if(now-s.started>=FISHING.seconds*1000)return {...s,phase:'result',held:false,message:'收竿！看看今晚的鱼获'};
 const age=(now-s.at)/1000;
 if(s.phase==='wait'&&age>=2.4+s.fish*.45)return {...s,phase:'bite',at:now,message:'咬钩了！现在按住提竿'};
 if(s.phase==='bite'&&age>(s.catches.length?FISHING.biteWindow:2.2))return {...s,phase:'escaped',at:now,message:'慢了一点，鱼把饵吃走了',held:false};
 if((s.phase==='caught'||s.phase==='escaped')&&age>1.6)return {...s,phase:'aim',at:now,held:false,message:'再选一条鱼，松开下钩'};
 if(s.phase!=='reel')return s;
 const f=FISH[s.fish],struggle=fishStruggling(age,s.fish),step=Math.max(0,Math.min(.1,dt));
 const tension=Math.max(0,s.tension+(s.held?(struggle?f.pull+.30:.08):-.64)*step);
 const progress=Math.max(0,s.progress+(s.held?f.speed:-.035)*step);
 if(tension>=1)return {...s,phase:'escaped',at:now,held:false,message:'鱼线绷断了！挣扎时松开泄力'};
 if(progress>=1)return {...s,phase:'caught',at:now,held:false,progress:1,catches:[...s.catches,s.fish],message:`${f.name} · ${f.weight} kg · +${f.value}`};
 return {...s,tension,progress,message:struggle?'鱼在挣扎！松开泄力':'好时机，按住收线'};
}

export function creditFishing(wallet:DemoWallet,id:string,amount:number):DemoWallet{
 if(!id||!Number.isSafeInteger(amount)||amount<0)throw Error('鱼获结算金额无效');
 if(wallet.fishingReceipts?.includes(id))return wallet;
 return {...wallet,balance:wallet.balance+amount,fishingReceipts:[...(wallet.fishingReceipts??[]),id]};
}
