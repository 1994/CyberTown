# 美术与素材说明

办公室、城市建筑、玻璃墙、电梯、工位、家具、植物、人物、纸箱、宠物猫、扫地机器人、图标头像和贴图均由本项目代码生成。没有下载或使用Kenney、Blocky Characters等外部模型，没有需要付费或来源不明的模型/动画包。人物动画使用程序骨架与姿态插值。

主要实现位于 `src/scene/`，Canvas程序贴图位于 `textures.ts`，统一材质位于 `materials.ts`，头像位于 `src/ui/Avatar.tsx`。这些原创项目代码适用仓库MIT许可。

中文使用系统字体（如PingFang SC及浏览器回退字体），仓库没有重新分发系统字体文件。Emoji由浏览器/操作系统渲染。

头像面具的结构和默认姓名肖像由项目代码生成，位于 `src/scene/FaceMask.tsx`，没有外部头像依赖。后续接入的用户头像由身份系统提供 URL，需使用已获授权的图片；仓库不包含真实员工照片。

## 核心依赖

以下许可从已安装锁定版本的package.json核对，依赖保留各自许可：

| 依赖 | 许可 |
| --- | --- |
| React / React DOM | MIT |
| Three.js | MIT |
| React Three Fiber / Drei | MIT |
| @react-three/postprocessing | MIT |
| postprocessing | Zlib |
| Zustand | MIT |
| modernc.org/sqlite | BSD-3-Clause（SQLite本身为公共领域） |

完整依赖及锁定版本见 `package-lock.json`、`go.mod`、`go.sum`。演示录像来自实际网页操作，步骤字幕是录制脚本额外加入的说明层，已在画面标记「演示步骤」，不冒充游戏功能界面。

## V3 图标

新增界面使用 lucide-react 的标准线性图标，采用ISC许可；其中源自Feather的部分图标采用MIT许可。完整版权与许可随仓库保存在 [lucide.txt](licenses/lucide.txt)。商店和小队展示复用游戏自己的3D人物、材质与动画，没有从其他游戏拷贝人物或UI。

## 游戏手机 KIM 图标

按产品需求，`public/icons/kim.jpg` 使用 [Kim 官方 App Store 页面](https://apps.apple.com/cn/app/id1451160242) 公开展示的应用图标（开发者 Beijing Kwai Technology Co., Ltd.），2026-10-20 下载，100×100。商标与图像权利归原权利人所有，不适用本仓库 MIT 许可。它在游戏中标识 KIM 风格的任务入口；本项目没有接入或访问真实 KIM 的账号、任务或消息。手机壁纸、应用装饰与其余图标由 CSS、SVG 和现有 lucide 图标实现，不包含 Apple 图像或系统字体文件。
