# 身份 / SSO SPI

游戏只依赖 [identity.Provider](../identity/provider.go)，不依赖某家公司 SSO SDK、HTTP 协议或组织目录。当前自带 Demo 和本地 Mock；公司 SSO 协议尚未接入。

## 接口与边界

```go
type Provider interface {
    ID() string
    Authenticate(context.Context, Credentials) (User, error)
}
```

- `ID()`：固定的发行方 / 租户命名空间，1—64 个 ASCII 字母、数字、点、下划线或短横线，首字符为字母或数字。`demo` 保留给内置体验身份；改变 ID 会建立新的账号命名空间。
- `Credentials`：客户端提交的 `code`、`accessToken`、`redirectUri`；`playerId` 仅供 Demo 使用。凭证不落库、不广播；不能用客户端传来的姓名、工号或头像直接证明身份。
- `User`：验证成功后返回 `subject,name,title,avatarUrl`。`subject` 用上游不可变 ID，例如 issuer/tenant 下的 sub，不能用可变邮箱或姓名。姓名最长64码点，职称128，subject512；不能含首尾空白或控制字符。职称只作展示，不决定游戏职级或技能。
- `avatarUrl == nil`：保留现有头像；指向空字符串：还原默认面具；其他值采用现有 HTTP(S) / 站内路径校验。登录成功自动同步玩家及分身头像并广播，无需另调头像接口。
- 返回 `identity.ErrUnauthorized`（可 wrap）→ HTTP401；其他适配器错误 → HTTP503，不向日志或客户端透出上游错误内容。无效资料也拒绝登录。服务给适配器10秒 context；实现必须尊重取消，并为 SDK/HTTP 客户端设置超时，不能忽略 context 阻塞请求。

游戏层负责 `(provider,subject) → playerID` 映射、玩家/分身创建、600金币初始发放、成长记录及本地会话，全部在同一个数据库事务提交。重复登录只更新资料；钱包、晋升、道具、分身归属、交易记录保留。新分身统一基础收益技能10%，不会因为真实职称不同改变初始属性。

Demo 选择身份逻辑集中在 [backend/identity_demo.go](../backend/identity_demo.go)。它只能选择原有四个种子账号。注入其他 Provider 后，`/api/auth/test-login` 关闭、`/api/identities` 不列出玩家、HTTP 演示重置关闭。会话按 Provider 隔离，旧 Demo token 和其他 Provider token 不能进入当前模式。旧数据库自动增加两张身份表，保留原数据；旧会话归 Demo。

## 对接公司 SSO

推荐在**内网私有Go module**实现适配器并通过公共 `server.Run(ctx, config, provider)` 组装，不修改公共 `cmd/boss-server/main.go`。完整模板和独立打包步骤见 [内网部署](DECOUPLED-DEVELOPMENT.md#内网私有接入)。

```go
config := server.ConfigFromEnv() // APP_ENV=production，独立正式DB_PATH
err := server.Run(ctx, config, companyProvider)
```

`production`拒绝nil/demo/mock provider、演示重置和测试数据库；只创建虚构NPC，员工与分身来自实际SPI登录。标准测试启动器仍只识别 `AUTH_MODE=demo|mock`，未知值直接报错。

基础SPI可继续使用code/accessToken。要让同一份前端自动支持网页公司登录，额外实现 `identity.BrowserProvider.BeginLogin(ctx, callbackURL)`，配置 `LOGIN_CALLBACK_URL=https://game.example.internal/?boss_auth=callback`。返回BrowserLogin{URL, State}，前端按标签页保存State后跳转，收到code/state并匹配本标签页后交由 `Authenticate` 验证；Credentials新增 `state` 字段。授权state/PKCE/nonce的生成、存储、核验与单次消费由适配器完成。公司的协议和密钥不进入前端或公共仓库。

低层 `backend.NewApp` 的nil仍是兼容旧演示的显式Demo入口；正式部署使用 `server.New/Run` 的校验边界。

不使用上述浏览器桥时，内网已有登录壳也可把已取得的凭证交给通用入口：

```ts
import { useGame } from './store.ts';

await useGame.getState().loginWithCredentials({
  code: verifiedCallbackCode,
  redirectUri: configuredCallbackURL,
  state: verifiedCallbackState,
});
// 或使用 accessToken（取决于公司适配器支持什么）
```

该入口负责换取本地会话、加载玩家并播放入场。也可使用底层 `api.authenticate(credentials)` 自行编排；上游 accessToken 不能直接当游戏 Bearer token。Demo模式显示测试选人，BrowserProvider模式显示通用公司登录入口；真实OIDC/SAML或其他协议仍由内网适配器实现。

若使用 OIDC，签名、issuer、audience、有效期、授权码一次性消费、回调地址白名单，以及授权发起/回调时 state、nonce、PKCE 的校验由协议接入层完成；本 SPI 不替代这些流程。可信网关注入的身份可通过受控中间件 context 交给适配器，不能直接信任客户端同名 Header。会话仍沿用现有 Demo 生命周期：本地注销会删除 token 并关闭其 SSE；尚未实现 SSO 单点登出、停用用户即时撤销或会话过期策略。浏览器授权码流程的single-use校验由上述BrowserProvider适配器承担。

## 本地 Mock 联调

[identity/mock](../identity/mock/provider.go) 是并发安全的内存适配器，只接受配置文件中明确列出的 `accessToken`。fixture 是本地假凭证，不是公司 SSO 密钥。

保留正在跑的游戏，另起独立端口、独立数据库：

```sh
AUTH_MODE=mock \
MOCK_IDENTITIES_FILE=examples/identity/mock-users.json \
go run ./cmd/boss-server --host 127.0.0.1 --port 8795 --db /tmp/boss-identity-mock.db
```

第二个终端：

```sh
curl -sS http://127.0.0.1:8795/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"accessToken":"local-alice-token"}'
# {"token":"游戏会话...","playerId":"p-..."}

# 使用上一步返回的游戏 token；不使用 local-alice-token
curl -sS http://127.0.0.1:8795/api/state \
  -H 'Authorization: Bearer <游戏会话token>'
```

第二位玩家用 `local-bob-token`。fixture 的 key 是假 accessToken；value 为 User，`subject` 必填且需稳定。修改文件后重启以重载；保留 subject 即保留账号。此模式提供 API 联调，未增加网页输入假 token 的入口；前端集成测试可调用 `loginWithCredentials`。

也可在你打算切换的部署上通过环境变量运行 `make up`，例如 `AUTH_MODE=mock MOCK_IDENTITIES_FILE=examples/identity/mock-users.json make up`；该命令会按原有约定重启所管理的服务。Mock fixture 可自行复制到被忽略的 `.run/` 或仓库外，勿放真实 token。

## 自动化 Mock 测试

无需起服务、无需 Node 或真实 SSO：

```sh
make test-auth
go test -race ./...
```

注入任意成功、拒绝、超时/取消或错误结果：

```go
provider := identity.ProviderFunc{
    ProviderID: "test-company",
    Verify: func(ctx context.Context, c identity.Credentials) (identity.User, error) {
        if c.AccessToken != "fixture-only" {
            return identity.User{}, identity.ErrUnauthorized
        }
        return identity.User{Subject: "employee-001", Name: "测试员工"}, nil
    },
}
app := backend.NewApp(game, backend.Options{IdentityProvider: provider})
server := httptest.NewServer(app)
defer server.Close()
defer app.Close()
```

完整可运行测试见 [backend/identity_test.go](../backend/identity_test.go)：资料同步、头像保留/清空、资产成长与分身归属保留、并发首次登录、单次初始发放、事务回滚、重启持久化、旧库迁移、Provider 会话隔离、拒绝与上游故障不发会话、请求取消和 Demo 入口关闭。

本轮验证：`npm test`、`make test-auth`、`go test -race ./...`、`npm run build`；并实际启动独立 Mock 服务，验证双玩家登录、签约分红、重复登录保留资产、账本一致性和注销。真实公司 SSO 未联调。
