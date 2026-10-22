# 存储 SPI 与 mock 数据

游戏存储与企业身份是两个独立 SPI。身份接口仍为 `identity.Provider`；存储接口位于 `storage/storage.go`，通过 `server.Config.Storage` 注入。玩家、登录会话、钱包账本、店铺、营业记录、员工、合同交易与探索进度的后端读写都经过此接口。前端 API 不变。

## 内网接入

在内网自己的 Go module 中实现 `storage.Store`，并在私有启动入口配置：

```go
// companyStore 是你实现的 storage.Store；companyIdentity 是现有身份 SPI。
c := server.ConfigFromEnv()
c.Environment = "production"
c.DatabasePath = "" // 使用 Storage 时不需要 SQLite 文件路径
c.Storage = companyStore
c.MockDataFile = ""
err := server.Run(ctx, c, companyIdentity)
```

`Store` 的职责：

| 方法 | 契约 |
| --- | --- |
| `Initialize(ctx)` | 创建或升级存储结构；幂等、增量，不清空已有存档 |
| `Writer()` | 返回写入池，冲突事务必须串行化或提供等价隔离 |
| `Reader()` | 返回读池，可与写池相同；不得读到半笔交易 |
| `Close()` | 关闭所有底层资源，建议幂等 |

`Pool` 提供 Exec、Query、QueryRow、Begin、BeginTx 与连接统计；`Tx` 提供查询、写入、Commit、Rollback。`Rows`/`Row` 为接口，不要求返回具体 `*sql.Rows` 或 `*sql.Tx`。`sql.Result`、`sql.ErrNoRows`、`sql.Scanner` 和 `sql.TxOptions` 保留 Go 标准库语义；无连接池的实现可返回零值 `sql.DBStats`。需要取消的身份写入经 BeginTx/ExecContext/QueryRowContext 传递 context。

如果内网使用 `database/sql` 驱动，可用 `storage/sqlstore.Wrap(db)` 复用 Pool/Tx/Rows 桥接，自己实现 Store 的建表迁移、读写池配置和 Close，不必重复写适配样板。

**当前是 SQL 存储 SPI，查询仍是 SQLite 方言，不是数据库无关的领域仓储。** SQLite 已实现并通过回归；MySQL、PostgreSQL、HTTP 数据服务没有现成适配器。换引擎时需要在自定义适配层处理 `?` 占位符、`INSERT OR IGNORE`、`ON CONFLICT`、`rowid`、`sqlite_sequence`、标量 MIN/MAX 等差异，并提供等价表结构、索引、约束和事务隔离。只更换驱动或使用 `sqlstore.Wrap` 不会自动翻译方言。HTTP 服务如果没有跨请求事务，也不能直接用逐条远程写入替代金币/员工交易事务。

SQLite 默认实现：`storage/sqlite/sqlite.go`，表结构：`storage/sqlite/schema.sql`。配置保持原有单写连接、WAL 多读连接；内存测试库使用单连接。未配置 Storage 时，原 `DB_PATH`/`--db` 启动方式继续有效。旧数据库无需导入或清空。

`server.New` 先校验配置；校验失败时 Storage 仍由调用者持有。配置通过后由运行时接管 Storage：初始化、基础数据或 mock 导入失败都会关闭它，成功后由 `Runtime.Close()` 关闭。底层 `backend.OpenWithStorage` 从调用开始接管 Store。初始化失败不会悄悄回退到本地 SQLite。

## 插入 mock 数据

身份凭据 JSON 继续使用 `MOCK_IDENTITIES_FILE`；游戏数据使用独立的 `MOCK_DATA_FILE`/`--mock-data`。

```sh
# 从仓库根目录运行，使用独立测试库；不要指向人工验收存档。
APP_ENV=test go run ./cmd/boss-server \
  --db .run/my-mock-town.db --host 127.0.0.1 --port 8901 \
  --auth demo --mock-data examples/storage/tea-team.json --static dist
```

示例为老王提供 3000 额外金币、2级店、两名分别为60/180经验的员工，另给小李2000金币，方便切换身份测试合同交易。加上首次进入小镇的正常补助，老王余额为5000。员工初始闲置，可在大厅派工或挂牌，真实价格和交易继续使用原业务接口。

JSON 格式：

```json
{
  "id": "my-scene-v1",
  "players": [{
    "playerId": "wang",
    "coinsGrant": 3000,
    "shopLevel": 2,
    "clones": [
      {"sourceId": "system-a", "xp": 60},
      {"sourceId": "system-b", "xp": 180}
    ]
  }]
}
```

- `id` 是整个场景的幂等键。同 ID、同数据重复启动不重复发钱/创建员工；同 ID 改数据会报错。新增场景用新 ID；已有员工不会被覆盖，新场景再次插入同一员工会整体失败。
- `players[].playerId` 必须已存在，或由同一文件的 `colleagues` 先创建。demo 自带 wang/li/mei/liu；使用身份 SPI 的测试账号要先登录完成 provisioning，再通过 `Game.ApplyMockScenario` 注入，或重启加载该文件。生产环境禁止 mock。
- `coinsGrant` 是额外补助，0..10000000，写入玩家及系统双向账本；不算经营收入。`shopLevel` 省略或0保持现状，1..3设置等级。
- `sourceId` 必须是该玩家可雇佣的有效候选；XP 0..1000000。60经验解锁店员，180解锁经理。单镇最多12人；mock 员工签约成本记0，累计签约需求随新增员工增加。
- 全部玩家、金币、经验、需求计数和场景标记在同一个事务内导入；任何错误整批回滚。不会重置原有数据；已应用的场景在重启后仍被记住。
- JSON 最大1 MiB，拒绝未知字段、负值、重复玩家/员工、尾随对象；没有通过 HTTP 暴露任意数据写入端点。
- `Game.ApplyMockScenario` 可由测试代码调用；`DecodeMockScenario(io.Reader)` 可读取你生成的数据。数据之外的自定义测试条件可在测试工程用注入的 `Store.Writer().Begin()` 设置，务必把账本和关联表一起维护。

`--reset` 仍是显式清空演示存档的命令，不作为导入流程的一部分。mock 文件不是每次登录补发。

## 启动时导入同事候选（无需先登录）

保留原 `--mock-data` / `MOCK_DATA_FILE` 入口，使用 `examples/storage/colleagues.json`：

```sh
APP_ENV=test go run ./cmd/boss-server \
  --db .run/colleagues-demo.db --host 127.0.0.1 --port 8901 \
  --mock-data examples/storage/colleagues.json --static dist
```

```json
{
  "id": "my-colleagues-v1",
  "colleagues": [
    {"playerId": "mock-lin", "name": "小林", "title": "设计同事", "color": "#f38aca", "avatarUrl": "https://your-intranet.example/avatar/lin.png"}
  ]
}
```

- 每条包含稳定的 `playerId` 和姓名；ID 格式为 `mock-` 加 1～64 位字母、数字、下划线或连字符。职位、头像和颜色可省略；颜色为六位十六进制，头像沿用身份 SPI 的 URL 校验。
- 导入会在同一个事务创建测试玩家资料、同事外观和已开放的招募分身，启动后所有其他玩家即可在“同事分身”列看到。不需要这些同事先登录，也不自动雇佣他们。
- 不创建登录令牌或身份绑定，不授予初始金币，不覆盖已有同事。此入口用于模拟通讯录候选；真实登录仍由 `identity.Provider` 提供。
- `players` 可省略，也可与 `colleagues` 同时配置。若需要预先雇佣新同事，在 `players[].clones` 中使用 `sourceId: "employee:mock-lin"`。同事先导入，再处理金币和员工安排。
- 同 `id`、同内容重复启动是无操作；修改内容需换场景 ID。新增同事用新 ID 的增量文件，仅写新增条目；若同事 `playerId` 已存在，整个文件报错并回滚，不会覆盖名字、头像、金币或员工归属。
- 可通过 `server.Config{Storage: yourStore, MockDataFile: path}` 使用自己的存储实现；程序内仍可调用 `DecodeMockScenario` / `Game.ApplyMockScenario`。仍只在测试环境开启，生产的存储和身份 SPI 无需改动。

招募大厅用候选的 `playerId` 区分同事和 NPC：有玩家来源的是同事分身，无玩家来源的是 NPC 员工。两列各自保留岗位筛选、排序和空态，手机端也保持两列。

## 适配器验收

```sh
go test ./...
go test -race ./backend ./server -run 'StorageSPI|MockScenario|StorageInjection|MockFile|TownMarket|TownEconomy|ReadPool'
```

`backend/storage_spi_test.go` 使用自定义 Store/Pool/Tx 包装真实 SQLite，验证注入路径、初始化/种子失败资源回收和 Commit 失败回滚。`backend/mock_scenario_test.go` 验证并发幂等、账本、经验、重开持久化与导入失败回滚；`server/storage_test.go` 验证配置入口和生产隔离。已有市场测试验证并发买家只有一人成交及账本失败整笔回滚。

内网新适配器必须对自己的数据库再运行等价测试；当前测试不代表已验证其他数据库。
