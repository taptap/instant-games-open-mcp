# 制作配方

所有素材路径相对 --source-root，不允许逃出该根目录。--recipe 可放工作目录，输出必须新建。
固定格式 version:1；size:[宽,高]；background 和 reference 必须与 size 同尺寸；playback.speed 默认 1。

    {
      "version": 1, "size": [1536, 864],
      "background": "source/empty.png", "reference": "source/full.png",
      "playback": {"speed": 1},
      "objects": [
        {
          "id": "chair", "label": "椅子", "category": "家具",
          "source": "source/chair.png", "bbox": [100, 300, 200, 300],
          "motion": "spring", "pivot": [0.5, 1], "duration": 1.2, "fps": 20,
          "start": 0, "speed": 1, "parent": null, "zIndex": 1
        },
        {
          "id": "chair_copy", "label": "第二把椅子",
          "reuseOf": "chair", "reuseReason": "同向同造型，仅摆放尺寸不同",
          "bbox": [600, 300, 160, 240], "start": 1.5, "speed": 1, "zIndex": 2
        }
      ]
    }

- bbox 是最终静态图的场景像素 xywh；不随裁切图尺寸变化。
- source 可为透明独立图或拆件图集；图集另填 extractRect:[左,上,右,下]，注意不是 xywh。
- 脚本去透明边后缩放到 bbox 尺寸；可用 clipPolygon:[[归一化x,y],...] 排除人工确认的杂边，不能替代语义拆件。
- pivot 是静态图内归一化锚点；家具通常 [0.5,1]，布饰通常 [0.5,0]。
- motion:rock 适合高书柜，围绕底部锚点左右倾斜回摆、逐渐停稳；motion:slide 适合宽书桌，从左侧滑入并小幅摆动落稳。两者均烘焙为透明序列帧，自动计算旋转留边，末帧与静态图一致。不要再叠加游戏端缩放或摇晃；摆动不传递给 parent 关联物件。
- motion:roll 用于平铺地毯由上向下（场景后方向前方）卷展，直接填本次地毯 source、bbox、duration、fps 和 pivot:[0.5,0]。脚本用新图生成逐步铺平的纹理及收缩卷筒，无需准备 sequence；pivot 不影响卷展方向。适用于透视已经画入图片的直向卷展，不模拟任意方向或真实布料物理。末帧与静态图一致。
- duration、start 单位秒；导出时间均为毫秒。fps 默认 20，支持 1～30；烘焙上限 120 帧，单帧最长边 4096。
- reuseOf 直接引用唯一资源的实例 ID，不支持链式引用；不重复提供 source、motion、duration 或 pivot。独立 speed、start、bbox 保留。
- parent 是支撑依赖，不是相对坐标或变换继承。所有 bbox 都是场景绝对坐标；子物件至少等支撑物入场完成再出现。

## 已有逐帧动画

motion 设为 sequence，保留 source（最终静态图）、bbox，并提供 animationBox 与 sequence：

    {
      "motion": "sequence", "animationBox": [100, 280, 240, 160],
      "sequence": {
        "image": "source/unroll-atlas.png",
        "frames": [
          {"rect": [0, 0, 240, 160], "durationMs": 50},
          {"rect": [240, 0, 240, 160], "durationMs": 100}
        ]
      }
    }

rect 为图集像素 xywh，顺序就是播放顺序。要求 1～120 张等尺寸、未裁紧、未旋转的透明帧。animationBox 表示整个帧画幅在场景的位置，包含透明留边。序列复用实例也提供自己的 animationBox；不从静态 bbox 猜测留边。

画布预览是 256 像素单元的缩小图集，与正式素材分开输出。manifest.json 每个 item 含 assetId、file、title、category、frameSetInfo，直接用于 CLI 动画导入。
