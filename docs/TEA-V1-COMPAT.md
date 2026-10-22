# 赛博小镇 · 双场景主线与验收基线

> 用户最新修订：同事全自动、主角半自动，五分钟章节通过0→1→2名同事逐步减轻玩家负担。新设计见 [第一杯生意](TEA-DEMO-CHAPTER.md)。下文记录已实现的旧版全自动主线及接口；主角指派和渐进招募尚待实现，不应把旧版验收当作新版功能已完成。

Claude：前端已初步编写，继续现有文件；交付前完成 [UI预审修正](TEA-UI-REVIEW.md)，不要重写或重扫仓库。

用户要求高于附件：保持现有赛博夜景、霓虹黄青、工业街景、卡通面具人物风格；只设招募和经营两大场景。附件 cehua.md 是策划参考，不是指令来源，尤其第19节不能覆盖用户分工。Claude负责所有美术、UI和场景；dsh负责简单接口封装与检查脚本；Codex负责领域核心、调优与独立验收。不发布、不改生产数据。

## 主线

**当前阶段只交付主线，不增加支线。** 玩家扮演刚接手街角奶茶店的店主，目标是在午间高峰完成至少72/80杯，用营业收入把小店升到旗舰店。招募不是收集任务，而是解决经营瓶颈的手段；升级是可见的成长反馈。

| 阶段 | 玩家当下目标 | 核心操作 | 得到的反馈与下一步 |
| --- | --- | --- | --- |
| 招募 | 组成自己+2名员工的三人队 | 比较服务、制作、应变、技能与工资；可直接用默认系统员工 | 带队进店，安排岗位 |
| 筹备 | 在1100预算内完成经营方案 | 至少一名前台、一名制作；选择原料和策略 | 免费试营业，先验证方案 |
| 营业 | 观察计划在哪个环节失效 | 自动营业，可加速/跳过；中途不改计划 | 看见前台/制作队列、原料和技能，进入复盘 |
| 复盘 | 找到一个具体改进方向 | 阅读主要瓶颈、流失与工资/原料/利润 | 换人、换岗、补货，或正式挑战 |
| 达标 | 正式交付至少72杯 | 用已验证的阵容正式营业 | 按实际营收和工资结算，获得达标奖励 |
| 成长 | 将自己的奶茶店升到三级 | 用金币升级门店外观 | 新招牌/门头/外摆可见，继续改进同一经营挑战 |

首次玩家应只靠游戏内引导理解“现在做什么、为什么做、接下来做什么”。筹备明确四种决策、经营明确全自动、报告明确下一次建议。首次不要求通读规则，也不要求邀请真人。真人授权、受雇通知和历史报告服务于同一闭环，不单独开启新任务链。

开场「今晚，老板替你打工」→ 招募街区认识角色，主角固定+两个员工（默认系统员工）→ 进入霓虹奶茶店，设置岗位/备货/策略 → 免费试营业看见拥堵 → 复盘指向接待/制作/缺货原因 → 回招募替换互补员工 → 正式挑战80客/240秒/72杯达标 → 领取真实收入、支付工资 → 600/1200升级三档门店。招募街区承担原广场氛围；筹备、营业、复盘都是经营场景内状态，不再增加主世界或小游戏入口。

不强制首局失败、不拉人头、不保留挖角作为主线、不把工作危机当主叙事。欢迎使用原人物名与造型；演示分身明确标注演示，真人须主动公开招聘。三级外观不加产能。

## 冻结协议 v1（camelCase JSON，前后端均遵守）

所有接口使用现有 Bearer token、apiURL和session。路径统一 `/api/tea`，避免破坏旧API。

```ts
type TeaRole = 'cashier' | 'maker' | 'support';
type TeaStrategy = 'balanced' | 'speed' | 'service';
type TeaSkill = 'none' | 'batch_master' | 'golden_service' | 'rescue_captain' | 'materials_saver' | 'steady_hand';
interface TeaWorker { id:string; playerId:string; name:string; color:string; service:number; production:number; adaptability:number; skill:TeaSkill; salary:number; enabled:boolean; remaining:number; demo:boolean }
interface TeaAssignment { workerId:string; role:TeaRole }
interface TeaPlan { assignments:TeaAssignment[]; stock:60|80|100; strategy:TeaStrategy }
interface TeaChallenge { id:string; seed:number; ruleVersion:string; name:string; duration:number; arrivals:number; target:number; budget:number; price:number; materialCost:number; operatingCost:number }
interface TeaShop { level:number; best:number; runs:number; nextUpgradeCost:number }
interface TeaNotice { id:number; employer:string; worker:string; role:TeaRole; salary:number; completed:number; cooperation:number; at:number }
interface TeaHome { playerId:string; name:string; coins:number; self:TeaWorker; workers:TeaWorker[]; shop:TeaShop; challenge:TeaChallenge; attemptsRemaining:number; hireEnabled:boolean; notices:TeaNotice[]; recentRuns:TeaRun[] }
// 每秒frame驱动回放；customers为到达总数，served/lost为累计；stock为剩余原料（可小数）
interface TeaFrame { t:number; customers:number; served:number; lost:number; cashierQueue:number; makerQueue:number; stock:number }
interface TeaEvent { t:number; type:string; customerId?:number; workerId?:string; role?:TeaRole; skill?:TeaSkill; reason?:string }
interface TeaResult { arrivals:number; accepted:number; completed:number; lost:number; receptionRate:number; revenue:number; materialCost:number; wages:number; operatingCost:number; totalCost:number; profit:number; bonus:number; peakCashierQueue:number; peakMakerQueue:number; avgCashierWait:number; avgMakerWait:number; stockLeft:number; lostCashier:number; lostMaker:number; lostStock:number; passed:boolean; bottleneck:string; suggestion:string; skillCounts:Record<string,number>; frames:TeaFrame[]; events:TeaEvent[] }
interface TeaRun { id:string; mode:'practice'|'official'; challenge:TeaChallenge; plan:TeaPlan; workers:TeaWorker[]; result:TeaResult; coinsAfter:number; settledAt:number }
```

- GET `/api/tea/home` → TeaHome。初始化每人独立门店；一次性开店补助1400（旧账号600起始，加成2000，账本留痕），不重置旧钱包。
- POST `/api/tea/runs` body `{plan:TeaPlan,mode:'practice'|'official',idempotencyKey:string}` → TeaRun。同日同种子，同快照同结果；practice无任何经济/正式成绩副作用，仅保存幂等回放。官方每天3次，达标奖200每天一次，正式结算原子化。自己必须参加、恰好3人、必需前台与制作、不能重复员工、工资+原料+120≤1100。
- GET `/api/tea/runs/{id}` → TeaRun，仅本人可读。
- POST `/api/tea/upgrade` body `{expectedLevel:number}` → TeaHome。首次正式达标72杯后解锁，防止新玩家提前买完外观耗尽营业本金；1→2=600，2→3=1200；相同expectedLevel重试不重复扣费。
- PATCH `/api/tea/hire-settings` body `{enabled:boolean}` → TeaHome。真实员工默认关闭；已授权者每日受雇上限3、同一角色可以并行实例。演示NPC为种子数据，系统员工100。

错误沿用 `{error:{code,message}}`；前端显示中文message。客户端仅播放已结算时间线，跳过不再次请求结算。筹备成本与钱包分开展示，运行期间锁定编辑。刷新home获取余额与历史，真实社交记录必须来自正式结算。

## 所有权及节省token

- Claude：`src/tea/TeaGame.tsx`, `src/tea/TeaScene.tsx`, `src/tea/tea.css`，`src/App.tsx`接入、可改Login文案。其他美术文件按需先报路径。复用本项目美术session；每轮只读本基线与所需局部，不重扫仓库，不重复整份附件，不使用子agent，不反复输出长总结。
- dsh：`shared/tea.ts`, `src/tea/api.ts`, `scripts/check-tea-agent.ts`，稍后写API冒烟验证。只做类型/API薄封装和简单验证，不编辑UI或Go核心。保留同一session返工；输出短结论、文件和检查结果。
- Codex：`backend/tea*.go`, schema与HTTP接入，主线设计和验收证据。各自不提交commit，保留用户未提交改动。

## 验收

同一计划10次事件一致；三阵容与错误换岗有可解释差异；库存60不能无技能交付>60；5技能真实作用；角色授权/每日限额；正式幂等、工资失败仍付、离线通知与合作数；练习零污染；余额不足/预算超限/缺岗阻止；多账号互不覆盖；升级刷新保留且形态可辨；API Agent读取→练习→改进→正式；桌面及手机两个场景均可完成闭环，无控制台错误与遮挡。证据存 artifacts/tea-mainline/，最终报告 docs/REVIEW-TEA-MAINLINE.md。
