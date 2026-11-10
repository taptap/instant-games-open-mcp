# UI 排版参数

不替用户决定构图。只按设计稿已经表现出来的关系调整下面这些引擎已有字段。
没有屏幕断点，也不要新造对齐模式字段。

## 先判断

- 边距都相对父节点，不是相对屏幕。要贴屏幕，父节点必须铺满屏幕或安全区。
- 固定贴某一边用 `position: "absolute"`，只写要对齐的边，再写宽高。对边不要写，否则会把控件拉变形。
- 会随内容增减、需要排队的区域用普通流式布局，不要一律改成绝对定位。
- `textAlign` 只决定字在控件内部靠左、居中还是靠右，不能把控件钉到屏幕边上。

## 可以调的参数

| 参数                                                      | 作用                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `position: "absolute"`                                    | 脱离自动排队，按 `left` / `top` / `right` / `bottom` 贴父容器            |
| `position: "relative"` 或不写                             | 参加父容器排队                                                           |
| `left` / `top` / `right` / `bottom`                       | 到父容器对应边的距离。数字是逻辑像素，也可以写 `"10%"`。只写需要钉住的边 |
| `width` / `height`                                        | 固定尺寸。和两条对边同时写会拉伸，固定按钮不要这样写                     |
| `minWidth` / `maxWidth` / `minHeight` / `maxHeight`       | 允许伸缩时的下限和上限。`maxWidth` 不会把内部固定坐标一起缩小            |
| `aspectRatio`                                             | 用一边推另一边。不要和宽高同时锁死                                       |
| `margin` 及 `marginLeft` / `Right` / `Top` / `Bottom`     | 节点外侧空隙。居中时配合 `left: "50%"` 使用负的 `marginLeft`             |
| `padding` 及四边、`paddingHorizontal` / `paddingVertical` | 容器内侧留白，子节点从留白里面开始排                                     |
| `flexDirection`                                           | 子节点排列方向：`column` 竖排，`row` 横排                                |
| `justifyContent`                                          | 沿排列方向怎么分布：靠起点、居中、靠终点、或均匀分开                     |
| `alignItems`                                              | 垂直于排列方向怎么对齐：靠起点、居中、靠终点、拉满                       |
| `alignSelf`                                               | 单个子节点覆盖父容器的交叉对齐。不能用来做“固定在右上角”                 |
| `flexGrow`                                                | 占据父容器剩余空间。列表容器可用，列表单项不要用来填满                   |
| `flexShrink`                                              | 空间不够时能否缩小。不写时预览按不缩小处理                               |
| `flexWrap`                                                | `wrap` 时放不下就换行                                                    |
| `gap` / `rowGap` / `columnGap`                            | 子节点之间的间距                                                         |
| `overflow`                                                | `visible` 允许超出容器，`hidden` / `scroll` 裁切；滚动需要 `ScrollView`  |

安全区不是普通对齐参数。`SafeAreaView` 只给自己的 padding 或 margin 加刘海和手势条。
绝对定位的按钮要放进它内部的普通容器，不能指望套一层就自动避开。

## 常见改法

右上角固定按钮，只对父容器的顶边和右边：

```json
{
  "position": "absolute",
  "top": 24,
  "right": 24,
  "width": 88,
  "height": 88
}
```

底部左右各一颗按钮：两颗都 `position: "absolute"`、`bottom` 相同，左边那颗写 `left`，
右边那颗写 `right`，都保留设计宽高。

标题在父容器里水平居中：`position: "absolute"`、`left: "50%"`、`marginLeft` 为宽度的一半取负，
`top` 保持原距离。

背景铺满父容器，不跟安全区缩进去：`left` / `top` / `right` / `bottom` 都是 `0`，不写宽高。
画面用 `backgroundFit: "cover"`，需要完整留白时用 `"contain"`。

列表区域随屏幕变高、每一行尺寸不变：使用 `ScrollView` 作为列表容器，设置 `flexGrow: 1`，
行保持原宽高，不要把行压扁。容器高度需受父布局约束，内容超出时才能滚动；
普通 `Panel` 仅设置 `overflow: "scroll"` 只会裁切，不会获得滚动交互。

这套字段够用就只改这些。没有屏幕断点，也不要新造对齐模式字段。
