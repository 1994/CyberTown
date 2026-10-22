import {startRound} from '../shared/tableGames.ts';
import assert from 'node:assert/strict';
import {newFishingRound,castFishing,pullFishing,tickFishing,fishingReward,FISH,fishStruggling,creditFishing} from '../shared/fishing.ts';
let s=newFishingRound('test',1000);
assert.equal(s.aim,-3);
s=castFishing(s,1000);assert.equal(s.fish,0);assert.equal(s.phase,'wait');
assert.equal(pullFishing(s,1100).phase,'escaped');
s=tickFishing(s,3500,.05);assert.equal(s.phase,'bite');
assert.equal(tickFishing(s,5800,.05).phase,'escaped');
s=pullFishing(s,3550);assert.equal(s.phase,'reel');
let now=3550;
while(s.phase==='reel'&&now<20000){now+=50;s={...s,held:!fishStruggling((now-s.at)/1000,s.fish)||s.tension<.30};s=tickFishing(s,now,.05);}
assert.equal(s.phase,'caught');assert.deepEqual(s.catches,[0]);assert.equal(fishingReward(s.catches),40);
assert.equal(tickFishing(s,now+.01,.01).catches.length,1);
assert.equal(tickFishing(s,61000,.05).phase,'result');
let broken={...newFishingRound('break',1000),phase:'reel' as const,tension:.999,held:true};
assert.equal(tickFishing(broken,1400,.1).phase,'escaped');
for(let i=0;i<3;i++){let r={...newFishingRound('species'+i,1000),phase:'reel' as const,fish:i,at:1000};let t=1000;while(r.phase==='reel'&&t<40000){t+=50;r=tickFishing({...r,held:r.tension<.5},t,.05) as typeof r;}assert.equal(r.phase,'caught');assert.equal(fishingReward(r.catches),FISH[i].value);}
assert.equal(fishingReward([]),0);assert.equal(fishingReward([0,1,2]),310);
console.log('Fishing: approach, early/late strike, all species catchable, tension failure, single catch and 60-second deadline passed.');

const w=creditFishing({version:1,balance:2000,round:null},'paid',310);
assert.equal(w.balance,2310);assert.equal(creditFishing(w,'paid',310),w);
assert.throws(()=>creditFishing(w,'bad',-1));

const afterBet=startRound(w,'coin',100,0,'table',()=>.1,1);
assert.deepEqual(afterBet.fishingReceipts,['paid']);
assert.equal(creditFishing(afterBet,'paid',310),afterBet,'table games must preserve fishing payment receipts');
