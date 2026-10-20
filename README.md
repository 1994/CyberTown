# 今天老板给我打工

**现实中我向你汇报，游戏里你给我打工。**

浏览器里的 3D 职场社交 RPG Demo。自由逛园区、遇见真人、招募虚拟同事、带队赚钱，也能加价挖走别人队伍里的王牌。新版把办公室扩展为可步行连接的广场、咖啡区、人才街、项目区与露台花园。

![自由探索首版](artifacts/redesign/03-desktop-first-review.png)

> 当前为 review 原型，地面遮挡待修；完整状态见 [新版独立 review](docs/REVIEW-V2.md)。

前端由本机 **Claude Code** 开发；**Codex 实现 Go 服务端、协调、独立验收和 GitHub 交付**。

## 立即运行

需要 **Go 1.26+**、**Node.js 22.18+（含 npm）** 和 **Make**，支持 macOS / Linux。本机实际验证 Go 1.27.2、Node 25.9.0。

```sh
gh repo clone 1994/boss-works-for-me -- --branch review/social-campus
cd boss-works-for-me
make up
```

访问 **http://localhost:8787**。`make up` 自动安装锁定版本依赖、构建前后端，并在后台启动一个 Go 进程提供页面和 API；健康检查成功后才提示就绪。直接运行 `make` 也一样。首次启动自动创建四个各有600金币的测试玩家，后续启动和重新部署保留数据。

```sh
make status    # 查看状态和访问地址
make logs      # 查看日志，Ctrl+C 退出日志查看，服务继续运行
make down      # 停止服务，保留数据库
make restart   # 使用已有构建重启
git pull
make up        # 更新代码后重新构建并重启
```

默认只允许本机访问。如需局域网内其他设备访问，可以运行 `HOST=0.0.0.0 make up`，然后打开 `http://这台机器的IP:8787`。修改端口可用 `PORT=9000 make up`；也可复制 `.env.example` 为 `.env` 后修改配置。数据库默认位于 `data/boss.db`，日志和 PID 位于 `.run/`，均不提交 Git。

`make up` 的后台进程适合本地或单机 Demo，不会注册开机自启。更多命令用 `make help`。需要热更新开发时：

```sh
make down
make dev       # Go API 8787 + Vite 5173，浏览器访问 http://localhost:5173
```

也可以直接使用 npm 和编译产物：

```sh
npm run build
npm run start:binary
# 访问 http://127.0.0.1:8787
# 也可运行编译产物：./bin/boss-server
```

使用现代桌面浏览器及 WebGL。优先为桌面1440×900设计，也提供390×844手机布局。低端设备可在URL加 `?lowfx=1` 关闭后期效果和阴影；正式画面默认启用完整效果。

## 新版怎么玩

**走过去 → 遇到人 → 做项目 → 升职带队。**

用 WASD / 方向键自由走，或点击地面、地图地标自动步行。靠近角色再互动；公式和账单放到详情，不必先读教程。[策划改造与验收目标](docs/GAMEPLAY-V2.md)。

玩法定案：[职场成长与园区社交](docs/COMMUNITY-MODE.md)。取消空间布置，新增新人→专员→主管→经理→合伙人的晋升主线。晋升 Go 后端已实现并积累业绩，网页入口待 Claude 接入；[前端交接规格](docs/CLAUDE-CAREER-HANDOFF.md)。上面的克隆命令拉取本次 review 分支，稳定 main 不包含这轮改版。

本轮状态见 [新版独立 review](docs/REVIEW-V2.md)：行走、双玩家互动、交易与项目已实测；首版园区地面存在遮挡问题，视觉验收待返工。

开两个独立标签页，分别选择「老王」和「小李」：

1. 在广场互相看到对方，走动、挥手、发一句头顶短句。两人靠近碰杯，各得15金币。
2. 去人才街找同事，确认价格后招募。最多三名队员，技能自动生效。
3. 接一个15秒项目，用空格或点击处理目标，结束后由服务端结算。
4. 找到另一位玩家或其同事，查看队伍并加价挖角；观察换队与双方金币同步。

真人控制自己的移动，交易的是其虚拟分身。离线身份不冒充真人。金币、队伍与消息保存在 SQLite；玩家位置为临时状态，服务重启回广场。测试会话在各自标签页 `sessionStorage` 中，刷新仍可登录。

## 固定规则

| 项目 | Demo规则 |
| --- | --- |
| 初始金币 | 600 |
| 初签价 | 300 |
| 再次挖角 | `ceil(前成交价×1.25/10)×10`，300→380→480→600… |
| 转会补偿 | 原持有人获得新成交价90%，向下取整 |
| 分身分红 | 分身本人获得5%，向下取整 |
| 系统回收 | 剩余金额及舍入零头；初签无持有人时回收95% |
| 有效团队 | 最多3名；不能签约自己的分身或已持有的同事 |
| 挑战 | 基础15秒；技能可提高收益、延长时长、保护连击 |
| 多人同步 | SSE；正常网络下目标不超过3秒 |

测试玩家的分身被交易时，对应可登录账号真实收到5%；其他NPC的分红记在虚拟角色个人钱包。所有币仅为游戏积分。

## 验证与演示素材

```sh
npm test                 # Go测试 + 36组规则契约 + 72条地图路径
npm run test:race         # Go竞态检测
npm run typecheck
npm run test:e2e          # 新版7项验收脚本，独立临时DB/8899端口
```

E2E默认使用本机Chrome；需要安装Chrome，或按Playwright配置切换浏览器。测试使用独立Go服务和临时数据库，不会重置8787上的普通预览。端口可用 `E2E_PORT` 调整。旧录屏脚本针对改造前UI，尚未适配本轮新交互；已有MP4仅作为初版留档。

- [初版 Codex 独立验收](docs/CODEX-REVIEW.md)：改造前的UI操作、交易金额与返工记录；本轮改版另见 [GAMEPLAY-V2](docs/GAMEPLAY-V2.md)。
- [服务端说明与API](docs/BACKEND.md)：事务、项目计时、SSE、部署和边界。
- [验收参考配置](docs/game-config.json)：经济参数；实际规则以代码为准。
- [旧版办公室演示内容与录制说明](docs/DEMO.md)（改造前版本）。
- 旧版演示：[双玩家MP4](artifacts/demo/boss-demo-2p.mp4) / [单人清晰版MP4](artifacts/demo/boss-demo-player-A.mp4)，未包含本轮自由探索改版。
- [功能与视觉验收清单](docs/ACCEPTANCE.md) / [美术素材与许可](docs/ASSETS.md)。
- [截图](artifacts/screenshots)：入场、入职、收拾纸箱、离职、奖励、分红、消息与手机界面。
- [独立UI账本核对](artifacts/verification/independent-ui.json)。

## 技术与部署

React + TypeScript + Three.js / React Three Fiber，Go `net/http` + SQLite（纯Go驱动）+ SSE。3D角色、家具、建筑和贴图由代码生成，不依赖未授权模型或付费素材，启动不需要外部美术CDN。

```sh
docker build -t boss-demo .
docker run --rm -p 8787:8787 -v boss-demo-data:/data boss-demo
```

本机没有Docker，因此镜像构建尚未实际验收；原生Go编译和运行已验证。当前部署支持一个Go服务进程，代理需要关闭SSE缓冲。数据库和密钥配置不会提交Git。环境变量见 `.env.example`。

```sh
npm run seed     # 仅在没有数据时初始化，保留现有数据
# 停止演示服务后重置，清空该演示数据库：
npm run reset
```

## Demo范围

**未接公司SSO**，登录页明确标识预置测试身份。当前未实现生产身份授权、强反机器人/反作弊、多实例通知总线或生产压测。服务端验证时间、任务ID、重复操作并自行算奖励，但不应将这版演示的操作记录校验宣传为生产级反作弊。

代码采用MIT许可；第三方依赖保留各自许可。详细美术和依赖说明随交付记录提供。
