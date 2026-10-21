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
| POST `/project/start` | Bearer；返回run、种子、服务端时钟 |
| POST `/project/finish` | Bearer；`{runId,actions:[{taskId,t}]}`；奖励以服务端为准 |
| POST `/career/promote` | Bearer；`{expectedRank}` |
| POST `/shop/buy` | Bearer；`{itemId,expectedPrice}` |
| POST `/shop/equip` | Bearer；`{itemId,kind,target}` |
| POST `/messages/read` | Bearer；标记已读 |
| GET `/world` | Bearer；园区边界与在线玩家 |
| POST `/world/move` | Bearer；`{x,z,yaw,moving}` |
| POST `/world/social` | Bearer；`{emote?,text?}` |
| POST `/world/highfive` | Bearer；`{targetId}` |
| GET `/audit` | Bearer；当前演示经济核对接口，尚非管理员权限模型 |
| POST `/demo/reset` | 仅显式开启的Demo测试环境，其余拒绝 |

`rules-contract.json` 是36组跨语言计分样例，Go与TypeScript测试读取同一个文件。字段/规则变更应在两端兼容地一起提交，不能只改网页展示算法。未知JSON响应字段应被忽略以允许增量扩展；当前协议尚未提供并行多主版本升级。
