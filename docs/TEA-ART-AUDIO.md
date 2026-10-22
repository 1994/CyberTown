# 赛博小镇 · 美术与音乐精修

本轮优化现有可玩版本的美术和声音，不把尚未实现的半自动章节伪装成已接入。用户最新章节方向仍见TEA-DEMO-CHAPTER.md。保持招募/经营两场景、原赛博夜景黄青工业语言、卡通面具角色；界面少文字。

## 分工

- Claude：全部美术/UI/3D/配乐与音效设计，编辑src/tea/TeaScene.tsx、TeaGame.tsx、tea.css、src/ui/SoundControl.tsx、src/sound.css、src/musicScore.ts；不要编辑音频引擎和hook。
- dsh：只新增src/tea/useTeaAudio.ts，按下述协议薄接入。不要编辑UI/引擎/乐谱。
- Codex：src/music.ts、audio.ts、audioCues.ts音频实现，独立实机/音频渲染/生命周期验收、必要的测试与记录。

都复用原session，只读本任务和必要局部，不重扫、不子agent、不提交、不添加依赖。各自不要覆盖其他人的文件。Claude接入hook时可先按冻结接口导入，dsh稍后创建文件。

## 视觉验收目标

街区从三块平板门面升级为有层次的紧凑夜市角落：招聘亭、独立店面轮廓、窗内暖光、雨棚/线缆/工业细节、克制的湿地材质。经营场景做成可读的奶茶工作吧台：接待、制作、取饮区分明，器具/原料/杯架有生活感，三档外观有显著轮廓变化。减少空旷地板、平灰大墙、过曝招牌；人物/动作和队列比背景优先，镜头不要裁掉招牌或被面板挡住角色。

保留原Character和面具辨识，细化挥臂、取杯、交付、离店等演出；实际动作绑定workerId和事件。制作队列不能伪装成已做好的杯子。现有确定性结果不改，动画不伪造工作成绩。用高亮/材质/图形替代反复长说明，卡片技能和完整报表按需展开但仍可读。使用可用区域自适应镜头，桌面/390×844/844×390可操作，lowfx及减少动态效果有降级。禁止重新引入drei Html门户。

## 冻结音乐接口

Claude新增src/musicScore.ts，导出如下名字/类型（无运行依赖）。原作电子夜市/温暖lofi配乐，主题在不同状态变化，不能只是提示音或机械音阶循环。曲目建议8小节以上，有和弦、旋律、低音和克制打击乐，主旋律不要刺耳；高峰通过节奏/配器增加张力，不简单加音量。

```ts
import type { SoundNote } from './audioCues.ts';
export type MusicScene = 'silent'|'street'|'prep'|'business'|'rush'|'report';
export type MusicInstrument = 'pad'|'keys'|'bass'|'pluck'|'kick'|'hat';
export interface MusicNote { step:number; midi:number; duration:number; velocity:number; instrument:MusicInstrument }
export interface MusicScore { bpm:number; steps:number; notes:MusicNote[] }
export const MUSIC_SCORES: Record<Exclude<MusicScene,'silent'>,MusicScore>;
export type TeaSoundCue = 'tea_order'|'tea_pour'|'tea_serve'|'tea_skill'|'tea_stock'|'tea_pass'|'tea_fail'|'tea_upgrade';
export const TEA_CUES: Record<TeaSoundCue,SoundNote[]>;
```

step为十六分音符整数，duration为拍数（四分音符），velocity为0~1。steps须为16的倍数，建议128或256；bpm建议76~116。pad/keys/bass/pluck用MIDI音高；kick/hat音高可填0，音色由引擎生成。每次谱面触发的音数不要超过12，并避免长音重叠超出12声部。TEA_CUES每音hz40~4999、length0.007~0.4、gain≤0.3，所有(at+length)<1秒，避免每杯都“叮”成噪声。

Codex在sound上提供setMusicScene(scene:MusicScene)、setMusicVolume(value:0..1)，getSnapshot()新增musicVolume与musicScene。原enabled/volume仍为全局开关/总音量，偏好持久化。音乐只在真实用户手势解锁后响；换景渐变，隐藏/静音/退出停止，恢复不追播。音乐音量独立于总音量；UI做紧凑可展开的声音设置，普通游戏不显示调试数据。SoundDiagnostics可增加data-music-scene/data-music-notes/data-music-voices/data-music-volume供真实验收。

## dsh hook协议

```ts
export function useTeaAudio(input: {
 view:'street'|'prep'|'play'|'report';
 run:TeaRun|null; frame:TeaFrame|null;
 shopLevel:number; teamKey:string;
}): void;
```

TeaRun/TeaFrame从shared/tea.ts导入。music：street→street，prep→prep，play且60≤frame.t<150→rush，否则business，report→report。unmount设silent。不要在每个帧effect cleanup里停止音乐。run/result是真实已结算事件，仅播放音效，不触发任何游戏请求或改经济。

逐帧映射order_started→tea_order、making_started→tea_pour、order_fulfilled→tea_serve、skill_triggered→tea_skill、customer_lost且reason=stock→tea_stock。每帧每类最多一次；初次进入回放/切run/倒退/跳帧>4模拟秒不补播旧事件。报告tea_pass/tea_fail按run.id去重（历史再看不重复庆祝），升级真实level上升触发tea_upgrade；teamKey首次非空初始化不播放hire，后续替换选人可播hire。用sound.play的key防重复；保留小型去重集合上限。音量/静音/可见性由sound统一处理，hook不要自己activate。

Claude在TeaGame所有hooks区（早返回之前）调用useTeaAudio({view,run,frame,shopLevel:home?.shop.level??0,teamKey:team.join('|')})，不要改变playback/结算行为。Toast、技能等音效不可在跳过时集中爆发。

## 验收

构建、既有音效契约和双端闭环通过；真实浏览器中手势前无声、手势后不同场景有音乐，静音/音乐音量/切后台正确；模拟和音效关联不发额外请求。留存改前/改后桌面/手机截图和各场景音乐渲染试听片段，检查波形无削波、切换无爆音、声部及调度器可回收。使用独立验收数据库，不重置8787服务。
