# Go 服务端

由 Codex 负责实现。前端由本机 Claude Code 负责。服务端采用 Go 标准库 `net/http`、`database/sql`、纯 Go 的 `modernc.org/sqlite` 和 SSE；没有 Node 运行时服务端。Node 仅用于前端构建和浏览器测试/录制脚本。

## 启动与构建

需要 Go 1.26+、Node 22.18+。本机验证环境为 Go 1.27.2、Node 25.9.0。

```sh
npm ci
npm run dev         # Go 8787 + Vite 5173
npm run build       # 前端 dist + bin/boss-server
npm start           # Go 启动并托管 dist，访问 http://127.0.0.1:8787
# 或直接运行已编译文件
./bin/boss-server
```

Go 本身也可独立工作：

```sh
go test ./...
go test -race ./...
go build -trimpath -o bin/boss-server ./cmd/boss-server
go run ./cmd/boss-server --seed
# 停止正在运行的演示服务后，清空这份演示数据库并重建四个600金币测试账号
go run ./cmd/boss-server --reset
```

默认监听 `127.0.0.1:8787`，数据库 `data/boss.db`。环境变量见 `.env.example`，也可使用 `--host`、`--port`、`--db`、`--static` 参数。DB 路径相对于进程工作目录。首次启动自动初始化种子，后续启动保留数据；`--seed` 不覆盖现有数据。

## HTTP 契约

JSON 错误统一为 `{ "error": { "code": "...", "message": "..." } }`。普通接口使用 `Authorization: Bearer <token>`。原生 EventSource 仅在 `/api/events?token=...` 传递演示会话；应使用 HTTPS，并避免代理记录事件URL的查询参数。

| 方法 | 路径 | 请求/结果 |
| --- | --- | --- |
| GET | `/api/health` | `ok,time,version,runtime:"go"` |
| GET | `/api/identities` | 四个测试身份及明确的非 SSO 声明 |
| POST | `/api/auth/test-login` | `{playerId:"wang"/"li"/"mei"/"liu"}` → `{token,playerId}` |
| GET | `/api/state` | 完整状态；前端类型见 `shared/types.ts` |
| GET | `/api/events` | SSE `hello` 与 `sync`，含交易详情用于动画 |
| POST | `/api/colleagues/:id/sign` | 必填整数 `expectedPrice`，变价返回409 |
| POST | `/api/project/start` | 返回服务端种子、开始时间、截止时间、技能快照 |
| POST | `/api/project/finish` | `{runId,actions:[{taskId,t}]}`；不采信客户端分数或奖励 |
| GET | `/api/career` | 当前职级、业绩、有效项目数、下一阶门槛与 `canPromote` |
| POST | `/api/career/promote` | 必填整数 `expectedRank`（当前职级）→ `{promotion,career}` |
| POST | `/api/messages/read` | 标记当前玩家私信已读 |
| GET | `/api/audit` | 玩家账本、单笔守恒、NPC分红、负余额、工位检查 |
| POST | `/api/logout` | 注销本会话并关闭其 SSE |
| POST | `/api/demo/reset` | 默认禁用，仅 `ALLOW_DEMO_RESET=1` 启用 |

前端的 `sessionStorage` 仅保存会话凭证；金币、归属、项目、消息全由数据库保存。每个测试身份有自己的分身；NPC 的5%记在该虚拟同事的钱包及账本，对应玩家的分身则直接增加真实可登录账号的金币。

## 交易一致性

每笔交易在 SQLite `BEGIN IMMEDIATE` 事务内完成报价/余额/槽位/归属校验、扣款、分账、归属转移、账本和消息写入，提交后才发 SSE。余额条件更新、角色版本号和唯一工位索引防止双花与重复归属。测试覆盖独立数据库连接之间的竞争，以及强制在写交易记录时失败后的完整回滚。

所有金币使用整数：初签300；下一价格 `ceil(前价 × 1.25 / 10) × 10`；原持有人向下取整得90%，分身本人向下取整得5%，余数进系统。初签无原持有人，分身本人5%、系统95%。一笔交易的账本借贷之和必须为零；项目与碰杯奖励为新发行金币。

挑战基础15秒，允许300毫秒结算容差，结束后30秒内可提交。开始时固定技能快照；重复开始恢复原局，禁止刷种子；截止前拒绝领奖，过期持久化，领取只能提交一次。服务端独立生成任务并核对任务ID、时段、重复和90毫秒操作间隔。Go的32位PRNG运算和计分通过36组与 TypeScript 的契约样例逐项对照。

## 职场晋升

晋升规则见 [模式定案](COMMUNITY-MODE.md)，前端接入规格见 [Claude 交接](CLAUDE-CAREER-HANDOFF.md)。目前 Go 后端已实现，网页晋升入口尚未接入。

每个经服务器核验的非陷阱命中 +10 业绩，一局有命中才计为一个有效项目。结算同时更新奖励、账本、项目状态、业绩与有效项目数；重复提交不会重复累计。空局、过期或未结算项目没有晋升进度。买卖、分红和碰杯不增加业绩。

`player_careers` 独立表保存职级和累计成长。启动时自动补建缺失记录，从旧存档已结算项目的 `result.hits` 恢复业绩及有效项目次数；不自动替玩家升职，不改钱包，已有职级不被覆盖。显式演示重置才清空成长。

`GET /api/state` 的 `career` 包含 `rank,name,performance,completedProjects,incomePct,next,canPromote`；满级 `next:null`。`me` 和 `players[]` 增加 `rank,rankName`，保留原人物 `title`。`teamSkills` 只含队友；新增 `projectSkills` 为下一局预览，收益为队友（最高75%）加职级（最高20%）。`run.skills` 是锁定的本局合计技能。

`POST /api/career/promote` 原子检查当前职级和两项门槛，逐级提升、记录消息并递增版本；不扣金币和业绩。请求必须提交当前 `expectedRank`，防并发重复晋升。错误为400 `BAD_RANK`，409 `RANK_CHANGED/NOT_ELIGIBLE/MAX_RANK`。成功提交后通过 SSE 广播 `event.kind="promotion"` 及 `playerId,fromRank,toRank,rankName,incomePct,at`。

项目完成响应增加 `performanceEarned,career`。开局后再晋升只影响下一局，不改已保存的 `run.skills`，Go/TS 随机任务与计分契约保持一致。

## 多人园区接口

全部需要 Bearer 测试会话。`GET /api/world` 返回 `serverTime`、地图边界和 `players`。只返回持有 SSE 连接的在线身份；位置为进程内临时状态，重启回广场，金币和队伍保留。相同身份的多个标签页共享同一世界人物。

- `POST /api/world/move`：`{x,z,yaw,moving}`，移动推荐5Hz、闲时1Hz；限制坐标边界、有限数值、80ms最小间隔与基础步行速度，拒绝明显瞬移。当前家具碰撞由客户端处理，不宣称服务端完整物理校验。
- `POST /api/world/social`：`{emote?,text?}`；表情 `wave/dance/coffee` 持续3秒，短句最多40个Unicode码点、持续6秒，每人1秒冷却。
- `POST /api/world/highfive`：`{targetId}`；双方在线、距离≤4米，双方各15金币，每对60秒冷却。冷却与奖励在同一 SQLite 事务中，防并发重复且重启保留；返回 `{reward:15,cooldownUntil}`。

世界变化通过现有 SSE 通道推送 `{type:"world",serverTime,players}`，客户端直接插值更新，不触发经济全量快照。金币变化仍推送 `{type:"sync",event:{kind:"highfive",playerId,targetId,reward:15,at}}` 后刷新真实钱包。位置包包括 `id,x,z,yaw,moving,emote,emoteUntil,said,saidUntil,updatedAt`。断线重连通过 GET 与进场广播补齐。

这是单进程小规模 Demo；真实测试玩家以外的巡游角色是NPC，不计入在线人数。

## 部署

macOS / Linux 安装 Go 1.26+、Node.js 22.18+ 和 Make 后，运行 `make up` 即可安装依赖、构建前后端并后台启动，访问 `http://localhost:8787`。更新代码后再次执行 `make up` 会重新构建并重启，SQLite 数据保留。

`make status` 查看进程状态，`make logs` 查看日志，`make down` 优雅停止，`make restart` 使用已有构建重启。`.env` 和环境变量均生效，例如 `HOST=0.0.0.0 PORT=9000 make up`。默认只绑定本机地址。PID、启动地址与日志保存在被 Git 忽略的 `.run/`，停止命令会检查进程归属，避免误杀 PID 被复用后的其他程序。后台启动会检查 `/api/health`，失败时返回非零状态并展示日志。

这些命令提供单机 Demo 的进程管理，不包含开机自启；需要长期托管时可用 systemd 或下方 Docker 方案。

```sh
docker build -t boss-demo .
docker run --rm -p 8787:8787 -v boss-demo-data:/data boss-demo
```

Dockerfile 为多阶段构建，服务进程以普通用户运行，纯 Go 二进制无需 CGO。当前机器没有 Docker，因此 Docker 镜像尚未实际构建验收；本机直接编译、HTTP测试和竞态检测均已实际运行。

部署为**一个 Go 服务进程**，所有浏览器连接它，通过 SQLite 文件持久化；SSE广播在本进程内。数据库层跨连接事务已测试，未实现多实例之间的通知总线。反向代理须关闭 SSE 缓冲，读取超时大于15秒心跳，示例：

```nginx
location /api/events {
    proxy_pass http://127.0.0.1:8787;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 60s;
}
location / {
    proxy_pass http://127.0.0.1:8787;
}
```

## Demo 范围

当前是预置测试身份，未接公司 SSO，也不包含生产账号管理、强反机器人、防刷与压力测试。结算规则防止伪造奖励值和无效任务，但有意构造符合规则的完整操作记录仍可被脚本提交，不能宣称生产级反作弊。全部币为游戏积分，无真实资金。上线公司环境前需替换测试登录、接入身份授权、限制重置并建立生产运维。

驱动的纯Go实现及事务锁参数参见 [modernc SQLite 官方文档](https://pkg.go.dev/modernc.org/sqlite)；规则与API以仓库实际代码和测试为准。
