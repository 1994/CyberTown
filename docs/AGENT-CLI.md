# Coding Agent 作为普通玩家

Claude Code、Codex 等工具通过 `boss` CLI 操作自己的游戏身份，与浏览器玩家处于同一世界，使用相同的金币、队员、小游戏、晋升和年终奖规则。Agent 自己写策略或调用命令；游戏不托管模型，不增加独立对战模式。

## 编译与进入游戏

```sh
make up         # 原有一键部署，现在同时编译 bin/boss
# 服务已在运行时，只编译客户端：
make build-cli  # 只需 Go，不依赖 Node、SQLite 或公司 SDK
./bin/boss help
./bin/boss --profile claude identities
./bin/boss --profile claude login wang
./bin/boss --profile claude observe
```

默认连接 `http://127.0.0.1:8787`。全局参数放在命令之前；支持局域网、内网 HTTPS 和网关路径前缀：

```sh
./bin/boss --server http://192.168.1.8:8787 --profile claude observe
BOSS_SERVER=https://game.example/company-game ./bin/boss --profile claude identities
```

保存的会话绑定服务器；切换到不同地址不会携带原来的 token，需要在该地址重新登录。不同 profile 使用独立会话、小游戏记录；不同玩家还必须选择不同身份。同一个身份在网页和 CLI 上操作同一份资产。

## 保持在线与观察

另一个终端启动订阅，Agent 可以将事件写入日志后按需读取：

```sh
./bin/boss --profile claude watch 300 > /tmp/boss-claude-events.ndjson
```

`watch` 持续连接现有 SSE，网页上显示该玩家在线，能看到其移动、外观、动作与气泡。结束订阅后离线；普通查询命令不会在后台启动常驻进程。省略秒数或传 0 则持续到 Ctrl+C；秒数上限一天。连接断开自动重连，401 等 HTTP 错误退出。

输出为 NDJSON，包含现有 `hello`、`sync`、`world` 消息。世界消息 `partial:false` 替换当前视野，`partial:true` 将 `players` 按 id 更新、按 `removed` 删除；重连重新提供当前视野全量。不要把增量当完整名单。经济 `sync` 后用 `observe` 或 `state` 读取最新资产。断线通知形如 `{"type":"connection","connected":false,"retryMs":1500}`。

```sh
./bin/boss --profile claude observe  # 紧凑观察：自己、团队、技能、晋升、年终奖、附近世界
./bin/boss --profile claude market   # 同事 id、报价、持有人、技能；包含可独自游玩的 NPC
./bin/boss --profile claude team
./bin/boss --profile claude ranking
./bin/boss --profile claude career
./bin/boss --profile claude messages
./bin/boss map                      # 地标坐标、碰撞体、步速、小游戏命中窗口
```

`world` 只返回当前附近订阅范围，不提供全地图实时雷达。`focus PLAYER` 复用联系人定位接口。`map` 为本版本静态地图，网页地图修改后须重新编译 CLI。

## 操作与策略

```sh
# 先读 market，填入真实 id 和观察到的价格
./bin/boss --profile claude sign colleague-id 300
# 已被他人持有的同事使用同一个 sign 命令加价挖角
./bin/boss --profile claude walk coffee
./bin/boss --profile claude walk -17 0
./bin/boss --profile claude walk-player li
./bin/boss --profile claude emote wave
./bin/boss --profile claude say '一起摸鱼吗'
./bin/boss --profile claude highfive li
./bin/boss --profile claude promote 0
./bin/boss --profile claude shop
./bin/boss --profile claude buy item-id 120
./bin/boss --profile claude equip item-id accessory player
./bin/boss --profile claude messages-read
```

`sign` 同时用于初签和挖角。价格变化返回 `PRICE_CHANGED`，CLI 不自动加价重试，由 Agent 重新观察和决策。`promote` 提交当前职级；门槛、三人团队上限、余额、所有权、社交距离和冷却都由现有服务端校验。

`walk` 通过同一地图的碰撞数据寻路，按 4.2m/s 分步上传位置，不瞬移；目标是水池/终端等障碍物时停在附近可行走处。`walk-player` 走向联系人本次定位的位置，不持续自动追踪。`watch`、走路与决策可分别运行；单个身份的移动和小游戏操作应顺序执行。命令失败退出 1、输出 JSON 错误；中途取消动作退出 130，应先观察状态再决定是否重试。

招募技能组合、是否挖角、何时晋升、存钱或换道具、找谁互动，均留给 Agent 自己决定。没有 CLI 专属奖励或自动赢局命令。

## 玩一局小游戏

```sh
./bin/boss --profile claude project start
./bin/boss --profile claude project view
./bin/boss --profile claude project hit
# 根据剩余时间重复观察/操作，倒计时结束后：
./bin/boss --profile claude project finish
```

`view` 只显示当前可见物品、进度、是否进入光圈，以及最前面的 `front`。`hit` 相当于网页上按一次空格，处理当前光圈内最前面的物品；大饼在前面时也会接到大饼，不能指定后面的奖励 id。无目标时为空按。CLI 不代替 Agent 选择出手时机，也不自动开下一局。

每局仍是 15 秒加团队时间技能，记录服务端时钟下的实际输入；服务端独立计分，拒绝提前结算、重复领取和无效输入。高频观察走轻量 GET `/api/project`，不重复加载全员目录。输入暂存在此 profile 的本地动作记录，`finish` 提交给原来的项目结算接口。

不要在同一局中切换网页和 CLI 输入：两端各自保留尚未提交的动作。保留 profile 目录可在 CLI 进程重启后继续本局。并发项目命令返回 `PROJECT_BUSY`，不会覆盖操作；仅在写入进程被强制杀死并确认已退出后，可删除报错中指出的 `.project.lock` 再继续。

## 公司 SSO / Mock 对接

`login ID` 只对应已有 Demo 登录，生产 / Mock 不开放选身份回退。现有 SPI 接受的凭证可从 stdin 提供：

```sh
./bin/boss --server https://game.example --profile claude login --stdin < /secure/spi-credentials.json
```

输入结构为现有身份协议，例如 `{"accessToken":"..."}`，或公司适配器支持的 `code/state/redirectUri`。浏览器专用 SSO 沿用公司登录流程，已有游戏会话可通过 `import-session` 从 stdin 导入 `{"token":"..."}`；CLI 会先向游戏 API 验证身份，再保存。也可由调用环境注入 `BOSS_TOKEN`。

CLI 不自行实现公司 OAuth，不读取浏览器凭证，也不使用员工列表伪造身份。会话默认保存在系统用户配置目录下的 `boss-player/PROFILE.json`，权限 0600，不回显 token；可用 `--config-dir` 或 `BOSS_CONFIG_DIR` 指定目录。只持有普通玩家权限，内网服务和身份 SPI 不依赖此 CLI。

## 给 coding agent 的任务示例

> 用仓库里的 `./bin/boss` 作为玩家，先看 help。连接指定测试服务器，使用 profile `claude` 和 Demo 身份 `wang`；另一名玩家用 `codex` / `li`。启动限时 watch 并按需读日志，自己分析市场和团队技能，玩小游戏、积累业绩、晋升、争取年终奖。操作只通过玩家 CLI，不修改数据库。价格冲突后重新判断，每笔支出自行决策。结束后汇报资产、职级和策略效果。

## 验收

- `make test-cli`：真实 HTTP 服务下验证登录、profile 隔离、NPC 签约、挖角补偿、旧报价冲突、小游戏输入与结算、拒绝重复领奖、晋升、买道具、穿戴和退出；另测真实 SSE 在线/下线、移动、碰杯、重连与过期会话、SPI 和会话导入。
- `go test -race ./...`、`go vet ./...`：覆盖服务端和客户端；计分继续通过原有跨语言契约样例。
- `npm run test:web`：包含地图/碰撞/传送带窗口与 CLI 数据的漂移检查；更新地图后执行 `node scripts/export-player-contract.ts --write` 并一起提交。
- Go 路线测试逐 0.025 米检查 8 个出生/外环起点到 10 个地标，避免沿路线穿墙。

本轮另用编译出的两个 CLI 连接独立的 127.0.0.1:8806 测试 API、临时数据库，完成真实时钟的一局小游戏、双玩家挖角、移动碰杯、晋升与道具穿戴；未连接现有 8787 玩家数据。

真实时钟验收样例：15.14 秒、19 次命中、0 次拒绝，奖励 384 金币，钱包由 657 到 1041；随后晋升至 rank 1 并购买穿戴 `sunset-shirt`。本次隔离试玩记录见 [JSON](../artifacts/agent-cli/smoke.json)。
