# 美术与素材说明

办公室、城市建筑、玻璃墙、电梯、工位、家具、植物、人物、纸箱、宠物猫、扫地机器人、图标头像和贴图均由本项目代码生成。没有下载或使用Kenney、Blocky Characters等外部模型，没有需要付费或来源不明的模型/动画包。人物动画使用程序骨架与姿态插值。

主要实现位于 `src/scene/`，Canvas程序贴图位于 `textures.ts`，统一材质位于 `materials.ts`，头像位于 `src/ui/Avatar.tsx`。这些原创项目代码适用仓库MIT许可。

中文使用系统字体（如PingFang SC及浏览器回退字体），仓库没有重新分发系统字体文件。Emoji由浏览器/操作系统渲染。

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
