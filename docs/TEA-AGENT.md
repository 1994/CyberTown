# Agent经营接口（tea.3 大地图救店）

当前真人主线是自由行走大地图与手机救店任务。Agent使用同权的领域接口完成经营；真人在地图走到店门再进入，Agent无须模拟鼠标行走。金币复用同一players.coins与ledger，不设独立余额。

1. 现有身份登录后 `GET /api/tea/home` 读取 `mission`、`wallet`、员工和进行中的营业ID。
2. `POST /api/tea/mission/accept`，body `{}`：接受救店任务，可重复，不加钱。
3. 开门请求 `POST /api/tea/sessions` 使用下方新rescue计划。允许0–2位同事，无旧教学门槛；招募是可选的。
4. 用原step接口根据当前队列指派主角批次；同事始终全自动。到 `status:finished` 才确认真实结算。
5. 手机任务只有正式班净增金币 `profit + bonus > 0` 才完成，并保存关联runId。免费试营不能完成有薪任务。
6. 读取home.wallet查预付与收入流水，用 `POST /api/tea/upgrade` body `{"expectedLevel":1}` 支付600升级，重试旧等级不重扣。

```json
{
  "lesson":"rescue",
  "mode":"official",
  "idempotencyKey":"town-first-shift-001",
  "plan":{
    "assignments":[{"workerId":"self","role":"support"}],
    "stock":20,
    "strategy":"balanced"
  }
}
```

rescue为240模拟秒、20位舒缓顾客、12杯达标，原料允许20/40/60份。员工短班工资是常规工资除以4向上取整，服务端冻结工资。其余半自动、幂等、名额、授权、预付及失败照付工资规则保持不变。`wallet.balance`为权威当前余额，`wallet.entries`为最近30笔实际收支。

```sh
./bin/boss-server --db .run/tea-town-check.db --host 127.0.0.1 --port 8898 --static dist
# 另一个终端
node scripts/check-tea-town.ts
```

脚本拒绝8787与试玩8897，只读写独立loopback服务；通过真实HTTP独自完成任务、结算、对账和升级，不读SQLite、不本地模拟。固定请求键重跑时对已完成存档只读检查；证据在 `artifacts/tea-town/agent.json`。

---

以下保留tea.2接口说明，用于旧营业恢复和回放；它的强制分段教学不是当前地图主线。

## tea.2兼容说明

Agent与网页使用同一身份、公开会话API、半自动规则和结算核心。Agent只在真实当前局面下指派主角批次，不能预先提交完整结果。同事会持续全自动工作。

## 首章流程

1. 通过现有身份适配器取得Bearer token。本地演示可用 `POST /api/auth/test-login`，body `{"playerId":"li"}`；生产不启用演示登录。
2. `GET /api/tea/home` 读钱包、员工、章节阶段及 `chapter.activeSessionId`。若有活动营业，先恢复该ID。
3. `POST /api/tea/sessions` 开门。按章节依次使用 `solo`（仅自己）、`duo`（加一同事）、`rush`（加两同事）；前两段是免费 `practice`，高峰可试营或 `official`。
4. `POST /api/tea/sessions/:id/step` 推进并按队列情况指派自己。一次最多3单或12模拟秒，已开工订单会做完，然后待命；可排下一批，重复点击不提速。
5. 直到 `status:"finished"` 后读取真实结果，正式达标进入 `upgrade`。`POST /api/tea/upgrade` body `{"expectedLevel":1}` 消费600升Lv2完成首章；再以等级2消费1200升Lv3完成主线。
6. `GET /api/tea/sessions/:id` 读取当前状态或冻结回放。只有所有者有权限。再次读取home确认进度与金币已保存。

正式高峰开门示例（员工ID必须从home确认）：

```json
{
  "lesson":"rush",
  "mode":"official",
  "idempotencyKey":"chapter-rush-001",
  "plan":{
    "assignments":[
      {"workerId":"self","role":"support"},
      {"workerId":"demo-wang","role":"maker"},
      {"workerId":"demo-li","role":"cashier"}
    ],
    "stock":80,
    "strategy":"balanced"
  }
}
```

一次推进示例（revision来自上次成功响应；requestId每个新动作唯一）：

```json
{"revision":12,"advance":1,"assign":"cashier","requestId":"session-001-step-13"}
```

`advance`是0–240的整数模拟秒；`assign`可省略或为 `cashier` / `maker`。指派时刻由服务端当前状态确定。仅指派不走时间时用0。Agent可大步推进，但不能把大步解释为主角会自动继续接活。

## 重试、经济与授权

- 开门超时重试同一幂等键与同一请求；推进超时重试同一requestId与原始请求。改写同键请求或使用过期revision返回409；不要用新键重复扣费。
- 正式开门只预付成本并保留当日营业/真人受雇名额，尚不产生收入或员工工资。结束才发销售收入、达标奖和工资，失败照付工资。最终钱包相对开门前变化为 `profit + bonus`。
- 免费试营不改变钱包、工资、正式次数或员工有酬名额，但真实出杯后可以推进教学章节。
- 正式每日最多3次；真人受雇也每天最多3次。默认未授权的玩家不可雇用；用 `PATCH /api/tea/hire-settings` body `{"enabled":true}` 主动公开分身。
- 策略 `balanced` / `speed` / `service`，备货60/80/100，预算不超1100。正式挑战80位顾客，至少72杯达标；日种子和首次达标奖200按UTC开店日冻结。
- 存档包含当前时刻、冻结队伍与已接受指派；中途重启可恢复。终局推进重试不会再结算。计划与历史不可修改。

完整协议见 `shared/teaLive.ts` 和 [规则契约](TEA-LIVE-CONTRACT.md)。旧 `/api/tea/runs` 是tea.1兼容入口；当前主线与本脚本不使用它。

## 可执行客户端

```sh
# 独立测试服务，必须使用测试数据库
./bin/boss-server --db .run/tea-live-check.db --host 127.0.0.1 --port 8896 --static dist
# 另一个终端
TEA_BASE=http://127.0.0.1:8896 node scripts/check-tea-live.ts
```

脚本拒绝8787及试玩8897，不读SQLite、不使用本地模拟。固定请求键可重复执行；已完成存档再次执行只读检查，不重复开店/升级。完整18项证据在 `artifacts/tea-chapter/agent-live.json`。
