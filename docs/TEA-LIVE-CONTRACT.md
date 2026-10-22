# 主线实际接入合同 · tea.2

本轮必须完成可玩主线，不停在策划。最新用户要求覆盖旧全自动规则。保持两场景和刚完成的美术/音乐，不加支线。沿用原会话、局部读写、不加依赖、不提交。

分工：Codex独占backend/*、src/tea/useTeaChapter.ts与验收；dsh独占新shared/teaLive.ts和src/tea/liveApi.ts（不要改旧协议）；Claude独占TeaGame.tsx、TeaScene.tsx、tea.css、所需美术件，不改controller/API/后端。

## 流程

新玩家0员工开局。solo免费试营90模拟秒（正常45真实秒），真实出过一杯后→去街区招1人→duo免费试营120秒（正常60真实秒）→招第2人→rush筹备→正式高峰240秒（正常60真实秒）→真实收益→升级Lv2完成首章。再升Lv3为主线完成；之后自由营业。失败可调整/免费试营重试；早期有效方案不强制失败。员工不需二次点名，自己每次指派最多3单或12模拟秒，一次一个批次、最多排下一批，重复点击不能提速。

服务端每次step从冻结计划+指派时间线确定性计算至当前时刻；不提前结算、不让前端伪造出杯/收入。营业时不能改队伍、库存、策略。正常推进、x2、暂停与跳过均走同一接口；跳过只让员工及已经指派的批次工作，不能替玩家自动指派。

## 新协议（dsh实现这些类型）

shared/teaLive.ts导入TeaHome/TeaRun/TeaFrame/TeaRole/TeaPlan旧类型并导出：

```ts
type TeaLesson='solo'|'duo'|'rush'|'free';
type TeaChapterStage='solo'|'duo'|'rush'|'upgrade'|'complete';
type TeaWorkRole='cashier'|'maker';
interface TeaChapter {stage:TeaChapterStage;soloBest:number;duoBest:number;activeSessionId:string|null}
interface TeaLiveHome extends TeaHome {chapter:TeaChapter}
interface TeaLiveCustomer {id:number;state:'cashier'|'ordering'|'maker'|'making'|'served'|'lost';at:number;workerId?:string}
interface TeaLiveWorker {id:string;role:TeaRole|'idle';customerId?:number;progress:number}
interface TeaSelfTask {role:TeaWorkRole|'idle';done:number;remaining:number;queuedRole:TeaWorkRole|null}
interface TeaLiveFrame extends TeaFrame {customersState:TeaLiveCustomer[];workersState:TeaLiveWorker[];selfTask:TeaSelfTask}
interface TeaCommand {t:number;role:TeaWorkRole}
interface TeaSession {id:string;lesson:TeaLesson;status:'active'|'finished';revision:number;t:number;run:TeaRun;frame:TeaLiveFrame;commands:TeaCommand[];hold:number}
interface TeaOpenSession {plan:TeaPlan;lesson:TeaLesson;mode:'practice'|'official';idempotencyKey:string}
interface TeaStep {revision:number;advance:number;assign?:TeaWorkRole;requestId:string}
```

new src/tea/liveApi.ts导出teaLiveApi：home():Promise<TeaLiveHome> GET /api/tea/home；open(input:TeaOpenSession):Promise<TeaSession> POST /api/tea/sessions；get(id:string):Promise<TeaSession> GET /api/tea/sessions/:id；step(id:string,input:TeaStep):Promise<TeaSession> POST /api/tea/sessions/:id/step。复制旧api.ts认证/错误处理方式（不改旧文件）。advance为0..240整数，assign只指派自己，时间由当前服务端状态决定。请求幂等、revision冲突取最新状态；完成session返回真实已结算run。

正式开店先预付成本（hold=总成本），结束才发销售/奖励与员工工资，失败照付工资，费用不重扣。免费试营hold=0，完全不动经济或正式次数。开店占用正式机会和真人员工名额；持续会话可刷新恢复，跨日仍按开店日结算。

## controller（Codex实现，Claude直接调用）

src/tea/useTeaChapter.ts导出useTeaChapter()，返回字段：

```ts
home:TeaLiveHome|null; error:string; toast:string; busy:boolean;
view:'street'|'prep'|'play'|'report'|'ending';
lesson:TeaLesson; goal:string; hiresNeeded:number;
team:TeaWorker[]; pool:TeaWorker[]; roles:Record<string,TeaRole>;
stock:60|80|100; strategy:TeaStrategy; totalCost:number; problems:string[];
session:TeaSession|null; run:TeaRun|null; frame:TeaLiveFrame|null;
events:TeaEvent[]; supportAt:TeaRole|null;
paused:boolean; speed:1|2; canAssign:boolean;
load():Promise<void>; pick(id:string):void;
setRole(id:string,role:TeaRole):void; setStock(n:60|80|100):void; setStrategy(s:TeaStrategy):void;
goShop():void; goStreet():void; start(mode:'practice'|'official'):Promise<void>;
assign(role:TeaWorkRole):Promise<void>; togglePause():void; setSpeed(s:1|2):void;
skip():Promise<void>; next():void; upgrade():Promise<void>;
openRun(id:string):Promise<void>; toggleHire():Promise<void>; logout():Promise<void>;
```

team包含主角；pool为可招同事；hiresNeeded是本段员工目标数0/1/2。run在营业中是服务端计算到当前时刻的真实部分结果，frame附稳定顾客/员工状态。events为当前帧附近实际事件。controller管理自动推进、重试、暂停、刷新恢复；Claude不用自写计时器/API。openRun历史不可操作，canAssign=false；音频已由controller调用useTeaAudio，UI别重复挂。

## Claude本轮验收

重做TeaGame为上述controller视图，默认只一句短目标。intro开门后即独自经营，不默认塞2系统员工。街区卡片默认名字/专长/工资，属性详情展开。准备只显示岗位、备货、策略、总成本；正式开门须确认预付款；行动按钮名称保持简短清晰。员工明确标“全自动”、自己标“待命/执行一批/下一批”。营业以3D为主，cashier/maker有队列时可点工位，按钮兜底“接待一批”“制作一批”；忙碌可排下一批，队列满禁用。暂停/x2/跳过都不伪造指令。

TeaScene ShopProps新增可选liveFrame?:TeaLiveFrame,onAssign?:(r:TeaWorkRole)=>void,canAssign?:boolean。有liveFrame时根据customersState稳定id渲染同一顾客贯穿排队/等饮/取杯/离场，不用队列索引换人或重复Walker。workersState负责谁在哪个岗位及正在服务谁，自己批次移动；高亮可指派工位、3格任务点，杯子仅实际完成后出现。旧frame模式可保留历史兼容。保持桌面/390×844/844×390，lowfx与减动支持，不用drei Html。已做的五场景音乐保留。

报告先显示完成数、真实净收益（练习明显标无结算）、瓶颈和唯一主推进按钮；曲线/账本默认详情。首章结束明确“同事接管日常”，显示真实0/1/2人记录和升级外观，不写死优势数字；之后继续经营/升级旗舰，Lv3明确主线完成。默认不显示长日志或技术错误细节。
