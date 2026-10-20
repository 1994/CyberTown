# 自由探索改版说明

当前前端已由 Claude 改为园区自由行走、跟随镜头、近身互动、短句/表情、三人小队跟随和单输入项目。主要入口为 `GameHud.tsx`、`Campus.tsx`、`Avatars.tsx`、`Colleagues.tsx`、`FollowCamera.tsx` 与 `src/world/`；静态地图、碰撞和寻路位于 `shared/world.ts`。

本轮状态与待修项以 [独立review](REVIEW-V2.md) 为准。下面保留的是初版办公室的交付说明，其中旧组件名、默认市场、旧项目卡片、长片头与旧E2E通过记录不代表当前版本。

---

# 前端说明（Claude Code 实现）

React 19 + TypeScript + Three.js（React Three Fiber 9 / Drei 10 / postprocessing）+ Zustand。所有游戏数据来自 Go 服务端；浏览器只在 `sessionStorage` 保存测试会话 token，在 `localStorage` 保存「上次选择的身份」「是否看过新手指引」这类纯界面偏好。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/api.ts` | REST 客户端，统一错误（网络错误 / `{error:{code,message}}`） |
| `src/store.ts` | 全局状态：快照、连接状态、吐司、抽屉、片头、补偿牌；SSE 事件 → 吐司/面板收起 |
| `src/realtime.ts` | `EventSource /api/events`：收到 `sync` 立即拉取 `/api/state`；断线显示横幅并 4 秒轮询兜底 |
| `src/scene/Office.tsx` | Canvas、灯光（暖色主光+阴影、冷色月光、工位吊灯、霓虹补光）、Lightformer 环境反射、Bloom/Vignette |
| `src/scene/City.tsx` | 渐变夜空、星星、月亮、约 150 栋程序化楼宇（Canvas 窗户贴图）、街道车流、城市霓虹 |
| `src/scene/Room.tsx` | 微缩底座、木地板、玻璃幕墙与窗框、电梯核心筒（滑门/楼层灯/轿厢灯）、霓虹招牌、会议区、休息区、咖啡吧、售货机 |
| `src/scene/Furniture.tsx` | 工位（显示器/键盘/私人物品/灯条）、椅子、植物、沙发、猫、扫地机器人等 |
| `src/scene/Character.tsx` | Q 版人物：7 种发型、6 种配饰、骨骼节点（身体/头/双臂/双腿）、纸箱、公文包 |
| `src/scene/Actors.tsx` | 演出状态机（见下）、老板本人、空工位/补偿牌 |
| `src/scene/CameraRig.tsx` / `focus.ts` | 入场电影镜头、斜俯视 Orbit 限制、市场打开时画面左移、演出镜头推近与回位 |
| `src/scene/Effects.tsx` | 签约彩纸粒子、技能光环 + 光柱 + 「技能激活」标签 |
| `src/ui/*` | 登录、HUD、人才市场与分账确认框、紧急项目小游戏、消息/排行/指南抽屉、SVG 头像 |

## 三段演出

1. **入场电影镜头**（9 秒）：城市远景 → 低空掠过工位 → 霓虹电梯 → 平滑归位，上下黑边 + 标题，不遮挡整个场景；「跳过片头」与 HUD「🎬 片头」重播。
2. **签约入职**：快照中出现新队员 → 角色在电梯轿厢出现（门打开、挥手、提公文包）→ 沿路径走到所属工位 → 转身坐下（桌面私人物品「布置」出现、屏幕亮起）→ 镜头推近 → 彩纸粒子 + 技能光环 + 「技能激活：收益 +25%」→ 开始打字。签约成功后人才市场自动收起。
3. **被挖角离场**：快照中队员消失 → 角色**不会立即删除**，而是转为离场状态：震惊 → 起身 → 收拾（桌面物品缩入纸箱）→ 抱纸箱走向电梯 → 进轿厢、门关闭 → 移除。角色真实走离工位（位移 > 2.4m）后才显示「空工位 · 补偿 +N」牌；被挖方的市场/抽屉自动收起，镜头推近工位。

演出由**服务端快照差异**驱动，因此不依赖某一条 SSE 事件是否到达；跨浏览器触发（另一玩家挖角）同样完整播放。每个角色名牌带 `data-actor / data-mode / data-phase` 属性，E2E 用它确认动画真实经过 `elevator → walk → sit → celebrate → work` 与 `d-shock → d-stand → d-pack → d-walk → d-enter`。

## 紧急项目小游戏

服务端 `start` 返回种子与开始/截止时间；客户端用 `shared/rules.ts` 同一 PRNG 生成相同任务序列，按服务器时钟（快照校准偏移）播放。点击/按 1–5 记录 `{taskId, t}`，本地连击/护盾/分数仅作展示；截止后提交，奖励以服务端结算为准，结果面板展示基础分、技能加成（向下取整）、护盾抵消、无效操作数。刷新页面可恢复进行中的项目（操作暂存在 sessionStorage）。

## 适配与可访问性

- 桌面 1440×900 优先；≤900px 切换为手机布局：顶部金币卡、底部团队栏+按钮条、人才市场底部抽屉。
- 3D 场景内 Html 标签处于独立层叠上下文（`.office-canvas { z-index:0; isolation:isolate }`），始终位于 HUD、抽屉、弹窗之下。
- 按钮禁用态写明原因（已在团队 / 你的分身 / 团队已满 / 余额不足）；`:focus-visible` 描边；对话框 Esc 关闭、自动聚焦；`prefers-reduced-motion` 降低动画。
- 加载画面、后端不可达错误页 + 重试、实时连接中断横幅、WebGL 失败兜底提示。
- `?lowfx=1` 关闭阴影与后期（低端设备/软件渲染）。

## 测试与录制

- `npm run test:e2e`：构建后由 `scripts/start-e2e-server.ts` 启动独立临时数据库的 Go 实例（默认 8899，不影响 8787 预览），6 项 Playwright 用例，均使用独立 BrowserContext 并收集 `console.error`/`pageerror`，截图写入 `artifacts/screenshots/`。
- `npm run demo:record`：独立实例（默认 8898）+ 两个独立 context 真实操作完整循环，Playwright 录制两路页面后 ffmpeg 左右拼接为 `artifacts/demo/boss-demo-2p.mp4`。画面左侧「🎥 演示步骤」说明条由录制脚本注入，不属于游戏 UI。

成片的实际时长、导出验收及当前macOS大型录制工具收尾限制，见 [DEMO.md](DEMO.md)。
