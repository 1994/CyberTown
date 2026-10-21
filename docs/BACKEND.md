# Go 服务端

独立前后端构建、API-only启动、内网私有SPI组装、测试与正式数据隔离见 [解耦开发与部署](DECOUPLED-DEVELOPMENT.md)。

由 Codex 负责实现。前端初版由本机 Claude Code 开发，本轮经用户授权由 Codex 接手续改。服务端采用 Go 标准库 `net/http`、`database/sql`、纯 Go 的 `modernc.org/sqlite` 和 SSE；没有 Node 运行时服务端。Node 仅用于前端构建和浏览器测试/录制脚本。

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

默认监听 `0.0.0.0:8787`，支持局域网，数据库 `data/boss.db`。环境变量见 `.env.example`，也可使用 `--host`、`--port`、`--db`、`--static` 参数；只需本机访问时设置 `HOST=127.0.0.1`。DB 路径相对于进程工作目录。首次启动自动初始化种子，后续启动保留数据；`--seed` 不覆盖现有数据。

## HTTP 契约

JSON 错误统一为 `{ "error": { "code": "...", "message": "..." } }`。普通接口使用 `Authorization: Bearer <token>`。原生 EventSource 仅在 `/api/events?token=...` 传递演示会话；应使用 HTTPS，并避免代理记录事件URL的查询参数。

| 方法 | 路径 | 请求/结果 |
| --- | --- | --- |
| GET | `/api/health` | `ok,time,version,runtime:"go"` |
| GET | `/api/identities` | Demo 返回四个测试身份；注入身份 SPI 后返回空列表；含 `mode,provider,notice` |
| POST | `/api/auth/login` | 通用 SPI 登录：`{playerId}`（Demo）或 `{code/accessToken,redirectUri?}` → `{token,playerId}` |
| POST | `/api/auth/test-login` | 原 Demo 登录兼容入口，仅内置 Demo 开放 |
| GET | `/api/state` | 完整状态；前端类型见 `shared/types.ts` |
| POST | `/api/profile/avatar` | `{avatarUrl:"https://.../avatar.png"}` 更新自己的头像面具；空字符串还原占位图 |
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

## 头像面具接入

SSO 接入已抽成独立 [身份 SPI](IDENTITY-SPI.md)：注入 `identity.Provider` 即可替换 Demo，提供本地 Mock 模式与 `make test-auth`。公司协议适配器尚未接入；SPI 登录会自动同步可信资料和头像。

统一的 3D `Character` 头部包含实体圆形面具、白色边框、侧绑带与正面头像贴图，会跟随头部动画转动；眼镜/墨镜位于面具外侧。未提供头像、图片加载失败或跨域受限时，继续显示本地生成的姓名肖像，不会让整个场景卡在加载状态。界面上的二维头像也使用同一 URL，加载失败回退原有卡通头像。

获取用户 avatar 后，在当前登录会话下调用：

```http
POST /api/profile/avatar
Authorization: Bearer <token>
Content-Type: application/json

{"avatarUrl":"/avatars/wang.png"}
```

前端已提供 `api.setAvatar(avatarUrl)`。身份 SPI 的 `User.AvatarURL` 会在登录事务中更新并广播；其他内部调用也可使用 `Game.SetAvatar(playerID, avatarURL)`，直接调用该方法后需广播 `kind:"avatar"`。HTTP 接口已完成广播。这里只提供接入能力，不额外增加上传入口或读取真实公司头像。

头像 URL 保存在该身份分身的 `colleagues.look.avatarUrl` 中，使用现有 JSON 字段，无需清空旧数据库；`avatarName` 随快照提供真实游戏姓名。`/api/state` 的 `me.avatarUrl`、`players[].avatarUrl` 及对应 `colleagues[].look.avatarUrl` 一致，`/api/identities` 也返回头像 URL。更新只作用于当前认证玩家，不接受覆盖其他玩家ID，分身被雇佣后仍显示分身本人的头像，刷新和重启保留。传 `{"avatarUrl":""}` 可还原默认面具。

支持 HTTP(S) URL 或以 `/` 开头的站内路径，最长2048字符；不接受 `data:`、协议相对地址、内嵌账号密码或非字符串。前端按中心裁切为方形后贴到圆形面具，横/竖图不会拉伸；建议源图使用正方形并把脸留在中间。跨域图片服务器必须允许浏览器 CORS（`Access-Control-Allow-Origin`），否则 WebGL 无法使用。推荐把已授权头像存为同源静态文件，例如 `public/avatars/wang.png`，构建后用 `/avatars/wang.png`；局域网设备也能读取，避免使用 `localhost` 绝对链接。这里没有实现下载头像的服务器代理。

## 交易一致性

每笔交易在 SQLite `BEGIN IMMEDIATE` 事务内完成报价/余额/槽位/归属校验、扣款、分账、归属转移、账本和消息写入，提交后才发 SSE。余额条件更新、角色版本号和唯一工位索引防止双花与重复归属。测试覆盖独立数据库连接之间的竞争，以及强制在写交易记录时失败后的完整回滚。

所有金币使用整数：初签300；下一价格 `ceil(前价 × 1.25 / 10) × 10`；原持有人向下取整得90%，分身本人向下取整得5%，余数进系统。初签无原持有人，分身本人5%、系统95%。一笔交易的账本借贷之和必须为零；项目与碰杯奖励为新发行金币。

挑战基础15秒，允许300毫秒结算容差，结束后30秒内可提交。开始时固定技能快照；重复开始恢复原局，禁止刷种子；截止前拒绝领奖，过期持久化，领取只能提交一次。服务端独立生成任务并核对任务ID、时段、重复和90毫秒操作间隔。Go的32位PRNG运算和计分通过36组与 TypeScript 的契约样例逐项对照。

## 职场晋升

晋升规则见 [模式定案](COMMUNITY-MODE.md)，前端接入规格见 [Claude 交接](CLAUDE-CAREER-HANDOFF.md)。Go 后端及网页晋升入口已实现，当前验收见 [V3](REVIEW-V3.md)。

每个经服务器核验的非陷阱命中 +10 业绩，一局有命中才计为一个有效项目。结算同时更新奖励、账本、项目状态、业绩与有效项目数；重复提交不会重复累计。空局、过期或未结算项目没有晋升进度。买卖、分红和碰杯不增加业绩。

`player_careers` 独立表保存职级和累计成长。启动时自动补建缺失记录，从旧存档已结算项目的 `result.hits` 恢复业绩及有效项目次数；不自动替玩家升职，不改钱包，已有职级不被覆盖。显式演示重置才清空成长。

`GET /api/state` 的 `career` 包含 `rank,name,performance,completedProjects,incomePct,next,canPromote`；满级 `next:null`。`me` 和 `players[]` 增加 `rank,rankName`，保留原人物 `title`。`teamSkills` 只含队友；新增 `projectSkills` 为下一局预览，收益为队友（最高75%）加职级（最高20%）。`run.skills` 是锁定的本局合计技能。

`POST /api/career/promote` 原子检查当前职级和两项门槛，逐级提升、记录消息并递增版本；不扣金币和业绩。请求必须提交当前 `expectedRank`，防并发重复晋升。错误为400 `BAD_RANK`，409 `RANK_CHANGED/NOT_ELIGIBLE/MAX_RANK`。成功提交后通过 SSE 广播 `event.kind="promotion"` 及 `playerId,fromRank,toRank,rankName,incomePct,at`。

项目完成响应增加 `performanceEarned,career`。开局后再晋升只影响下一局，不改已保存的 `run.skills`，Go/TS 随机任务与计分契约保持一致。

## 多人园区接口

全部需要 Bearer 测试会话。`GET /api/world` 返回 `serverTime`、地图边界和 `players`。只返回持有 SSE 连接的在线身份；位置为进程内临时状态，重启回广场，金币和队伍保留。相同身份的多个标签页共享同一世界人物。

- `POST /api/world/move`：`{x,z,yaw,moving}`，前端移动中5Hz、静止每5秒心跳，起步/停步及时发送；隐藏后补停步包。SSE维护在线状态。服务端限制坐标边界、有限数值、80ms最小间隔与基础步行速度，拒绝明显瞬移。当前家具碰撞由客户端处理，不宣称服务端完整物理校验。
- `POST /api/world/social`：`{emote?,text?}`；表情 `wave/dance/coffee` 持续3秒，短句最多40个Unicode码点、持续6秒，每人1秒冷却。
- `POST /api/world/highfive`：`{targetId}`；双方在线、距离≤4米，双方各15金币，每对60秒冷却。冷却与奖励在同一 SQLite 事务中，防并发重复且重启保留；返回 `{reward:15,cooldownUntil}`。

世界变化通过现有 SSE 通道推送 `{type:"world",serverTime,players}`，客户端直接插值更新，不触发经济全量快照。金币变化仍推送 `{type:"sync",event:{kind:"highfive",playerId,targetId,reward:15,at}}` 后刷新真实钱包。位置包包括 `id,x,z,yaw,moving,emote,emoteUntil,said,saidUntil,updatedAt`。断线重连通过 GET 与进场广播补齐。

这是单进程小规模 Demo；真实测试玩家以外的巡游角色是NPC，不计入在线人数。

## 部署

macOS / Linux 安装 Go 1.26+、Node.js 22.18+ 和 Make 后，运行 `make up` 即可安装依赖、构建前后端并后台启动，访问 `http://localhost:8787`。更新代码后再次执行 `make up` 会重新构建并重启，SQLite 数据保留。

`make status` 查看监听地址、本机与局域网地址，`make logs` 查看日志，`make stop` 或 `make down` 优雅停止，`make restart` 使用已有构建重启。`.env` 和环境变量均生效，例如 `HOST=0.0.0.0 PORT=9000 make up`。默认绑定 `0.0.0.0`；已有 `.env` 的 `HOST=127.0.0.1` 需改为 `0.0.0.0`，也可用 `make lan` 覆盖。PID、启动地址与日志保存在被 Git 忽略的 `.run/`，停止命令会检查进程归属，避免误杀 PID 被复用后的其他程序。后台启动会检查 `/api/health`，失败时返回非零状态并展示日志。

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

## 年终奖与永久道具（V3）

`GET /api/state` 增加 `year,shop`；每位 `players[]` 及 `me` 增加 `style`。项目结算响应增加 `yearAward`（未到三局为null），金币字段已包括年终奖。

3场至少一个核验命中的项目组成一个演示年。`player_years`记录轮次、第一场有效结算时的职级、技能与命中加成累计和同事碰杯加成。三局平均加成取整：每局技能最高30%、命中最高20%，碰杯最多10%。基础奖金按职级为300/450/650/900/1200。`year_awards(player_id,year)`唯一键防重复，同一项目结算事务内更新项目、成长、即时金币、奖金、账本、消息和新年进度；失败全部回滚。老存档的旧项目不追发年终奖，新奖励表从第一年零进度初始化；原金币、队伍与职级保留。

- `POST /api/shop/buy {itemId,expectedPrice}`：校验目录价格、余额与未拥有，扣金币、入库存、系统回收和账本同一事务。并发重复购买最多成功一次。错误包括400 `BAD_PRICE`、402 `INSUFFICIENT`、404 `NO_ITEM`、409 `PRICE_CHANGED/ALREADY_OWNED_ITEM`。
- `POST /api/shop/equip {itemId,kind,target}`：kind为`shirt/accessory/aura`，target为`player/boss`。必须拥有且槽位匹配。itemId为空字符串恢复默认穿戴，不删除收藏，不扣币。错误400 `BAD_SLOT/BAD_TARGET/BAD_ITEM`、403 `ITEM_NOT_OWNED`。
- `player_items`保存永久收藏，`player_styles`保存自己与老板各三个槽位的实际外观值。`style`为`shirt,accessory,aura,bossShirt,bossAccessory,bossAura`；老板穿搭跟随队伍主人，适用于张总与钱多多。
- 购买/穿戴成功提交后SSE广播`event.kind=shop/style`与playerId，其他客户端刷新快照。服务端不采信客户端提交的价格以外属性或道具效果。

道具目前纯外观，不额外加金币或能力。现有老板收入技能和职级收益仍由开局快照锁定。数值养成、好友关系、借调与非独占分身尚未实现。
