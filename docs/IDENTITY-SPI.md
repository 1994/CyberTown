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

1. 在独立适配器包实现 `identity.Provider`，通过公司 SDK / HTTPS 端点验证凭证，返回已验证资料；游戏业务不用改。
2. 在 [cmd/boss-server/main.go](../cmd/boss-server/main.go) 的组装处，用该实例替换 Demo/Mock provider 并注入：

```go
app := backend.NewApp(game, backend.Options{
    StaticDir: "dist",
    IdentityProvider: companyProvider, // 你的 identity.Provider 实例
})
```

`nil` 明确表示保留 Demo，不能用作公司配置缺失/初始化失败时的降级。适配器初始化失败应停止启动。标准启动器目前只识别 `AUTH_MODE=demo|mock`，未知值直接报错，`AUTH_MODE=sso` 不会假装已经接入。

3. 前端公司登录回调完成协议校验后，把凭证交给已有通用入口：

```ts
import { useGame } from './store.ts';

await useGame.getState().loginWithCredentials({
  code: verifiedCallbackCode,
  redirectUri: configuredCallbackURL,
});
// 或使用 accessToken（取决于公司适配器支持什么）
```

该入口负责换取本地会话、加载玩家并播放入场。也可使用底层 `api.authenticate(credentials)` 自行编排；上游 accessToken 不能直接当游戏 Bearer token。现有登录页仍负责 Demo 选人；公司登录跳转、回调路由与授权初始化须在确定公司协议后接入，当前没有预设 OIDC/SAML 流程。

若使用 OIDC，签名、issuer、audience、有效期、授权码一次性消费、回调地址白名单，以及授权发起/回调时 state、nonce、PKCE 的校验由协议接入层完成；本 SPI 不替代这些流程。可信网关注入的身份可通过受控中间件 context 交给适配器，不能直接信任客户端同名 Header。会话仍沿用现有 Demo 生命周期：本地注销会删除 token 并关闭其 SSE；尚未实现 SSO 单点登出、停用用户即时撤销或会话过期策略。

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
