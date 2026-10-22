# tea.3 大地图救店主线：本轮实现契约

以用户最新要求为准：恢复原来的自由行走大地图，不要用招募/经营两个顶栏页面替代世界。接手机任务也可暂缓；接受后可在广场招0–2名同事（完全可选），自己沿地图去奶茶小镇的奶茶店，营业取得真实金币。自己半自动，同事全自动不变。文字少、原赛博美术不变。

## 文件边界

- Claude：全部UI/美术/场景及App整合。拥有 src/App.tsx、src/tea/TeaGame.tsx、TeaScene/TeaDecor/tea.css、新TownGame/TownPhone/TownLandmarks、src/scene/Office.tsx 与需要的既有地图UI（避免无关重构）。**不改** useTeaChapter.ts、shared协议和backend。
- Codex：useTeaChapter.ts控制器、backend全部任务/金币/经营规则、独立实际验收与E2E。
- dsh：shared/tea.ts、shared/teaLive.ts、src/tea/liveApi.ts、shared/teaTown.ts（新）。只做以下薄协议与常量；不扫描、不装依赖、不提交。

## 后端协议（Codex实现，dsh实现类型与API）

`TeaLesson` 增加 `'rescue'`，保留solo/duo/rush/free旧存档回放。`TeaPlan.stock` 扩为20|40|60|80|100。

新 `shared/teaTown.ts` 定义：
```
TeaMission { status:'offered'|'accepted'|'completed'; acceptedAt:number; completedAt:number; income:number; runId:string|null }
TeaLedgerEntry { id:number; delta:number; kind:string; ref:string; at:number }
TeaWallet { balance:number; entries:TeaLedgerEntry[] }
```
`TeaLiveHome` 新增 `mission:TeaMission; wallet:TeaWallet`。
`POST /api/tea/mission/accept` body `{}` 返回 TeaLiveHome，幂等接受；`teaLiveApi.acceptMission():Promise<TeaLiveHome>`。
home是权威金币与任务状态；accept可重试，不能发重复奖励。任务完成依真实正式rescue收入净增（profit+bonus>0），不是点按钮完成。wallet.entries最新30笔金币记录，不只画静态钱包数字。复用players.coins和ledger，禁止新建平行货币或localStorage余额。

## 地图导航常量（dsh）

`TEA_TOWN_SITES` const（shared/teaTown.ts）:
```
recruit: {id:'tea-recruit', name:'广场招募', x:-5, z:12, range:2.8}
shop: {id:'tea-shop', name:'奶茶小镇·街角奶茶', x:-19.4, z:-1, range:2.8}
```
此处是可站立/交互点。shop原咖啡亭建筑中心(-22.5,-1)，原碰撞不改；Claude将其改成带“即将停业/营业”店招的奶茶店外观，可用独立标识覆盖，给周边小镇店面/路标。recruit在出生广场，走到那里开招募面板。保留原WORLD_BOUNDS、街道、花园、办公室、夜市等全地图。点击地面/WASD/摇杆/地图寻路都保留；导航按钮只设置真实寻路，不瞬移，不直接开店。到达范围后明确交互才打开招聘/室内，入口可点或E（手机有可点按钮）。关闭招募回地图；店内随时可返回地图（活动营业应暂停，恢复同一session）。禁止隐藏传送或自动接任务。

## 新控制器（Codex实现，Claude消费）

`useTeaChapter()` 返回原有字段/动作，默认lesson='rescue'、view='prep'，不再强制solo/duo与招满同事。
新增 `acceptMission():Promise<void>`。`home.mission`可读任务状态；`home.wallet`可读账本。
`pick`可选0–2人，`goStreet`/`goShop`仅供附近招募/进入后操作，父TownGame管理实际地图和室内位置。返回地图由TownGame用`togglePause`或控制器新增`pause():void`暂停活动营业。`resume`按原继续按钮。
TeaGame可改成接收 `{controller: TeaChapterController; onExit:()=>void}` 的室内界面；不要在里面再useTeaChapter，TownGame持有唯一controller。
Controller team/pool对rescue展示**短班工资**（原标准工资向上取整除以4），totalCost同口径；存档冻结工资由服务端验证，UI不自行支付。

## 首个真实有薪班（Codex）

`rescue`允许0/1/2名同事、初始任何chapter阶段，但只有mission.accepted/completed能开局；无需旧教学门槛。240模拟秒（默认约60秒实播，四个主角独自盈利已测试）、20位较舒缓顾客、12杯目标，备货20/40/60。初始20份，成本=备货*6+120+短班工资。售价20，正式日首达标奖200仍走既有规则；免费练习零金币。主角需按批次接待与制作；开门前选择0–2名同事、岗位、库存、策略。正式开门明确预付，结束才收收入/工资；未招人也能独自完成并获得正收益。不得靠伪造收入完成任务。

同事全自动，自己的批次最多3单/12模拟秒、一批排队不变。旧会话按冻结原lesson规则恢复；新rescue不破坏旧记录。升级使用真实金币600/1200，救店任务完成也可解锁首升级，不再强制旧72杯；地图外观立即更新且刷新保持。

## 展示动线与验收

1. 登录先在完整大地图广场，手机有奶茶店“快倒闭了，来帮个忙”的新任务通知，可关闭继续闲逛。
2. 手机查看/接受“救救街角奶茶”；不直接传送，提供“去广场找帮手（可选）/带路去奶茶店”。
3. 可招0–2同事；招募发生在广场，不能远程标签切场景。
4. 按真实寻路到小镇店门口，交互进入营业筹备。没有强制开门介绍遮住地图。
5. 正式营业，结束收入进同一金币钱包；手机任务完成、收支明细可查、刷新恢复。
6. 回到大地图自由探索，地图店面等级反映升级。手机任务/金币/地图入口可反复打开。

Claude注意加短的data-testid/aria-label以便自动化：town-world、town-phone、town-mission、town-wallet、town-enter-shop、town-recruit、town-go-shop、town-go-recruit、town-accept-mission。可在手机定位目的地并真实移动，禁止为了测试直达终点。
