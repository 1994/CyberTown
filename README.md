# 赛博小镇

**经营自己的霓虹小镇，培养员工，从奶茶店逐步发展。** 保留原大地图、黄青夜景、工业建筑和卡通面具人物。招募与经营是地图里的地点，不再把世界拆成两个页面。

## 当前主线

手机收到求助 → 自选接任务或先逛逛 → 雇佣大厅可选签约员工、派去杂活培养 → 沿地图去奶茶小镇 → 到店筹备、选入0–2位已培养的店员 → 收工赚金币 → 回到地图自由探索、升级门店。

默认每个玩家独享自己的小镇；同事分身独立签约，员工自动做杂活与营业工作。Lv1杂活、Lv2店员、Lv3经理巡检，员工合同可挂牌交易，成交保留等级经验。自己按批次半自动接待/制作，同事全自动；独自也能赚钱，招人后更轻松。首班20位顾客、12杯达标，默认约60秒实际营业，加上任务、招募、步行和筹备形成几分钟的新手章节。地图支持点击地面、WASD、摇杆与小地图寻路；“带路”不会瞬移或自动开店。

金币复用原钱包和真实账本：开店补助只发一次，正式开门预付成本，结束收入和员工工资到账，免费试营不产钱。手机可查余额、任务及收支，门店升级花600/1200金币。任务、营业、金币和外观都会保存；店内返回地图暂停当前营业，回来继续。

地图扩为180×132米，商业街、娱乐街延伸到集市、河港、乐园和滨河步道。四处考察各有一次30金币奖励，手机“版图”记录探索与首店成长。首店篇完成并考察全部商圈后进入连锁选址准备；多店运营与商业帝国属于后续章节。详见[探索与商业成长](docs/TOWN-EXPANSION.md)。

本轮先交付经营模型与雇佣大厅，含招聘、我的员工、合同交易市场。累计签约越多报价越高；培养后可自用或流转。互访与城市建筑成长分阶段推进，详见[私人小镇经营模型](docs/PRIVATE-TOWN.md)。

## 运行

需要 Node.js 22.18+、Go 1.26+、Make 和支持 WebGL 的现代浏览器。

```sh
npm ci
make up
```

打开 **http://localhost:8787**。`make up` 构建前后端并启动本地演示；SQLite数据保存在 `data/boss.db`，重启会保留已有数据和门店。不要用 `make reset` 清除需要保留的存档。

```sh
make status
make logs
make stop
make restart
make lan       # 开放局域网访问
make dev       # API 8787 + Vite 5173，适合开发
```

前后端可以独立构建和部署，生产身份通过现有SPI接入，静态前端用 `runtime-config.json` 切换API。详见 [前后端解耦](docs/DECOUPLED-DEVELOPMENT.md)、[身份SPI](docs/IDENTITY-SPI.md) 和 [服务端文档](docs/BACKEND.md)。本次主线不替换身份体系，不重置原钱包或旧数据；旧游戏API继续保留，但不再作为新版主线入口。

## 验证

```sh
npm test                         # Go与既有前端规则检查
npm run build                    # 前后端正式构建
npm run test:race                 # 并发与竞态检查
node scripts/check-tea-agent.ts   # tea.1兼容API验收（独立测试服务）
node scripts/check-tea-live.ts    # tea.2兼容章节Agent（独立8896服务）
node scripts/check-tea-town.ts    # 当前tea.3救店Agent（独立8898服务）
```

当前tea.3 Agent脚本只接受独立的本机测试服务，拒绝8787和试玩8897，避免改动试玩存档。先启动独立测试库：

```sh
npm run build
./bin/boss-server --db .run/tea-town-check.db --host 127.0.0.1 --port 8898 --static dist
# 另一个终端：
node scripts/check-tea-town.ts
```

它通过公开会话接口完成「接手机任务 → 不招人正式营业 → 真实金币收入 → 任务完成 → 升级」，验证预付、净收益、收支账本与幂等保存。使用固定幂等键，可重复运行，不重置数据库；证据写入 `artifacts/tea-town/agent.json`。`npm run test:e2e` 另行覆盖真人UI全流程与声音。

旧脚本 `check-tea-agent.ts` 验证tea.1兼容接口，历史证据在 `artifacts/tea-mainline/`，不替代当前章节验收。

## 设计与交付

场景美术补充夜市招聘亭、灯串、配料架、制作小票和独立取饮台；声音使用原创电子夜市主题，按街区、筹备、营业、高峰、结算切换配器。右上角声音按钮可分别调整总音量和音乐音量；首次点击后开始播放，静音或切到后台会停止声音。

`npm run test:music` 检查音乐声部、换景和资源回收；`npm run audio:preview` 使用实际乐谱和音色渲染五段试听（需要本机 Chrome 与 ffmpeg），输出到 `artifacts/tea-art-audio/`。

- [经营模型与可流转员工合同](docs/PRIVATE-TOWN.md)
- [本阶段独立验收与分工](docs/REVIEW-HIRING-MODEL.md)
- [主线设计、规则和接口协议](docs/TEA-MAINLINE.md)
- [tea.1历史验收](docs/REVIEW-TEA-MAINLINE.md)
- [当前大地图救店验收](docs/REVIEW-TEA-TOWN.md)
- [tea.2半自动章节历史验收](docs/REVIEW-TEA-CHAPTER.md)
- [美术与声音验收](docs/REVIEW-TEA-ART-AUDIO.md)
- [Agent经营接口](docs/TEA-AGENT.md)
- 员工配置：`backend/tea-workers.json`；确定性引擎：`backend/tea_sim.go`；前端：`src/tea/`。

本次按用户指定分工通过Orca协调：Claude制作全部新场景、美术与UI；dsh完成协议类型、API薄封装、验证脚本和员工配置提取；Codex设计主线和模拟/结算核心，独立复核、试玩并回收问题。两位工作者复用固定session接续任务，避免重复发送完整策划。

原有园区、小游戏、年终奖、挖角与道具系统的历史资料仍保留在 `docs/` 和 `artifacts/`，用于追溯，不代表新主线承诺。
