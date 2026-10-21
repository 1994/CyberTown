# 前后端共有契约

HTTP DTO 的前端声明在 `shared/types.ts`、`src/api.ts`；服务端实现位于 `backend/http.go` / `world.go`，不得要求前端读取数据库或公司 SDK。

所有路径以 `/api` 开头，JSON成功/失败均禁止缓存。失败为 `{ "error": { "code": "...", "message": "..." } }`。整数金币、毫秒时间戳。未认证游戏接口返回401，客户端只在401清除游戏会话；断网/503不退回Demo身份。详情见 [API文档](../docs/BACKEND.md)。

| 接口 | 认证与请求 / 响应 |
| --- | --- |
| GET `/health` | 无认证，健康检查 |
| GET `/identities` | 无认证，`identities,mode,notice,provider`；可选 `browserLogin,loginCallbackUrl`；SSO/Mock不枚举员工 |
| POST `/auth/browser` | BrowserProvider可用时返回 `{url,state}`；回调地址由服务端固定，不接受客户端传入目标 |
| POST `/auth/login` | `{code?,state?,redirectUri?,accessToken?}`；适配器验证后返回 `{token,playerId}`；`playerId`只供Demo |
| POST `/auth/test-login` | 仅Demo测试选人，其余模式404 |
| GET `/state` | Bearer认证，`StateSnapshot` |
| GET `/events?token=...` | 游戏会话，SSE `hello/sync/world`；断线自动重连，`sync`后重拉快照 |
| POST `/logout` | Bearer；删除游戏会话并关闭其SSE |
| POST `/profile/avatar` | Bearer；`{avatarUrl}` |
| POST `/colleagues/{id}/sign` | Bearer；`{expectedPrice}`；服务端原子判断所有权与余额 |
| GET `/project` | Bearer；仅自己的 `playerId,serverTime,activeRun`，供高频观察，避免拉全员目录 |
| POST `/project/start` | Bearer；返回run、种子、服务端时钟 |
| POST `/project/finish` | Bearer；`{runId,actions:[{taskId,t}]}`；奖励以服务端为准 |
| POST `/career/promote` | Bearer；`{expectedRank}` |
| POST `/shop/buy` | Bearer；`{itemId,expectedPrice}` |
| POST `/shop/equip` | Bearer；`{itemId,kind,target}` |
| POST `/messages/read` | Bearer；标记已读 |
| GET `/world` | Bearer；园区边界与在线玩家 |
| POST `/world/focus` | Bearer；`{targetId}`，仅允许在线联系人，返回当前位置并保留60秒；用于视野外寻人 |
| POST `/world/move` | Bearer；`{x,z,yaw,moving}` |
| POST `/world/social` | Bearer；`{emote?,text?}` |
| POST `/world/highfive` | Bearer；`{targetId}` |
| GET `/audit` | Bearer；当前演示经济核对接口，尚非管理员权限模型 |
| POST `/demo/reset` | 仅显式开启的Demo测试环境，其余拒绝 |

`rules-contract.json` 是36组跨语言计分样例，Go与TypeScript测试读取同一个文件。字段/规则变更应在两端兼容地一起提交，不能只改网页展示算法。未知JSON响应字段应被忽略以允许增量扩展；当前协议尚未提供并行多主版本升级。

新版世界协议：`/events?world=2&token=...` 首包 `partial:false`，之后 `partial:true` 的players为upsert，removed为删除ID。每次重连或慢消费者合并会再次发送全量当前视野；不可把增量players当成完整在线名单。onlineCount为全园区人数，nearbyCount为26米内实际其他玩家数（不受64位位置订阅预算影响），GET /world为当前附近完整快照。距离方案与范围见 [验收说明](../docs/REVIEW-PROXIMITY.md)。

`world-contract.json` 固定当前90×66米园区边界，Go世界接口测试与前端地图测试共同校验；扩图时须更新两端。街区建筑和长椅的绘制/碰撞来自 `shared/world.ts` 的共享空间数据。虚构NPC的散步由前端按服务端校时计算，仅用于未签约的两位NPC，不增加在线人数，不影响服务端资金与归属。

Coding Agent 使用普通玩家 CLI，见 [Agent CLI](../docs/AGENT-CLI.md)。`gameplay/navigation.json` 由 `node scripts/export-player-contract.ts --write` 从网页地图与传送带窗口导出；`make test-web` 检查漂移。Go 服务端与 CLI 共享 `gameplay.GenerateTasks`，不共享数据库访问。
