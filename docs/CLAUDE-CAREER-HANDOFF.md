# Claude 前端后续任务：职场成长与晋升

> 历史交接文件：用户已授权Codex接手，本轮晋升与奖励界面已实现。当前状态见 [V3验收](REVIEW-V3.md)，本页待办不再代表当前阻塞。

用户明确：取消空间布置，强化职场与晋升。前端由 Claude 实现，Codex 负责建议、review 和 Go 后端。本文件是可直接执行的交接规格，当前尚未由 Claude 完成。

## 优先处理既有验收问题

参见 [REVIEW-V2](REVIEW-V2.md)。Campus 地面被底座遮挡是 P1；先修地表高度并实机截图。再修默认交互选中自己的不可招募分身、登录按钮的覆盖语义、碰杯接收方冷却显示。保持自由行走和三人随队，不回到常驻卡片后台。

## 晋升 UI

- 无空间布置、家具收集、房屋升级系统。
- 工牌显示玩家游戏职级与紧凑进度；初始“职场新人”。身份原有 `title` 是人物介绍，不是游戏职级。
- 默认只提示下一阶所差业绩；详情显示累计有效项目条件。不要把两项条件伪装成单条百分比进度已经满足。
- 结算增加“业绩 +N”；达标只给一个“晋升”主要按钮。没有达标时可查看条件，最高级明确已满级。
- 晋升提交时禁用重复按钮；失败刷新状态并显示服务器原因。成功有简短人物/工牌庆祝，不强制长教学。
- 其他玩家姓名附近展示小工牌，区别真人、虚拟分身和身份介绍。不要依赖颜色单独表达职级。
- 项目开局展示团队和职级收益来源；进行中必须使用 `run.skills`，不能从最新状态重算本局奖励。

## 已可用的 Go API

新增字段兼容旧前端。所有接口使用现有 Bearer 会话，无需新服务。

- `GET /api/state` 增加 `career`、`projectSkills`；`me` 和 `players[]` 增加 `rank`、`rankName`。
- `GET /api/career` 直接返回下述 Career。
- `POST /api/career/promote` 必填 `{expectedRank: 0}`；响应 `{promotion,career}`。expectedRank 是当前职级，不是目标职级。
- `POST /api/project/finish` 增加 `performanceEarned` 和最新 `career`。
- 现有 SSE `sync` 增加 `event.kind="promotion"`，包含 `playerId,fromRank,toRank,rankName,incomePct,at`；提交成功后发送。现有同步机制刷新状态，按事件触发庆祝。

```ts
interface CareerLevel {
  rank: number; name: string;
  requiredPerformance: number; requiredProjects: number; incomePct: number;
}
interface Career {
  rank: number; name: string; performance: number; completedProjects: number;
  incomePct: number; next: CareerLevel | null; canPromote: boolean;
}
```

`teamSkills` 保持只含队友；`projectSkills` 是当前团队加职级的下一局预览。开始返回的 `run.skills` 为本局锁定的最终数值；现有 Go/TS 计分公式与任务序列不变。职级收益最高20个百分点，团队最高75，最终最高95。

错误：400 `BAD_RANK`；409 `RANK_CHANGED`、`NOT_ELIGIBLE`、`MAX_RANK`。401沿用原会话机制。禁止客户端自增业绩、职级或金币。

五级参数见 [模式定案](COMMUNITY-MODE.md)。目前主管之后的双人项目、跨组项目仍属后续规划，不放假入口。

## 验收交付

先 `npm run typecheck`、`npm test`、构建；更新新版 E2E 用例。交付时说明改动与待测项，不能声称仅编译通过就完成视觉验收。Codex 将用真实网页检查首次晋升、重复请求、刷新、双客户端工牌同步、下一局收益和进行中快照，再审核桌面/手机布局与地面修复。
