# ChatGPT 网页识图

> 已停用：本文件仅保留历史协议。当前识图统一使用 Server API 或自定义 API，不执行以下流程。

使用当前 Agent 已有的浏览器工具，先读工具规则。复用已打开的 ChatGPT 和登录态，
不安装浏览器或执行器，不复制 Cookie。缺少浏览器工具时明确说明，不改用客户端模型或 API。

## 登录与模型

- 先检查页面。已登录时读取当前模型和思考程度，沿用用户设置；不要每轮重选。
- 未登录时说明：「未登录也可识图，但无法选择模型，识别质量和 Bbox 准确度可能有偏差。」
  让用户选择「直接识图」或「登录后识图」。已有明确选择就直接执行，不重复问。
- 选择直接识图后继续使用网页当前可用模型，不检查推荐模型是否存在作为阻断条件。
  记录实际可见模型；不明时用 ChatGPT web / unknown model，不能写成 GPT-6 Astra。
- 选择登录后识图时才等待用户在当前页面完成登录。若用户要求推荐，建议 GPT-6 Astra／轻度；
  只有用户要求或确认更换时才操作模型菜单。登录不保证账号拥有指定模型。
- 网页实际限制仍需遵守：验证码、无法上传图片、额度用尽或强制登录时说明具体限制，
  由用户处理后继续。不要把“登录可选”解释为绕过网站门槛。

## 输入、执行、回填

1.  官方合批模板与历史分类模板使用同一双轮流程。先完成去文字并保存画布，用 canvas inspect 找到
    inputRole=text-free 的识图卡及其唯一上游原稿，不按标题里的序号或示例数量选择输入。
    获取第一轮输入（命令只读已保存画布，不发模型请求）：

        taptap-maker canvas recognition-input --target-dir <项目> --canvas-id <画布> --id <识图卡>

    保存返回的 canvasId、nodeId、design、cutSource，整个过程不改这些身份字段。
    上传返回的 imagePath，只发送返回的 prompt。每轮用新对话，保持当前模型与档位。
    浏览器只允许上传工作目录中的文件时，复制这张图片到允许目录，不改图片内容。
    确认附件上传完成、发送可用后只发送一次；等待完整回复，保存 cut JSON 和原对话 URL。

2.  写 reply.json，内容为第一步的四个身份字段加 cut（网页原始 JSON 对象）。
    原样再次调用 recognition-input，附加 --input-file <reply.json>。
    命令验证 UI 清单，返回原稿 imagePath 和包含已换算坐标的文字轮 prompt。
    上传并发送，保存完整的 text JSON 和对话 URL。失败或中断先查原对话，不自动重发。

3.  在 reply.json 增加 text、model（实际网页模型说明）和 durationMs。durationMs 是从第一次上传开始到两轮回复收齐的毫秒数，必须大于 0。没有测到的时间不要写 0。执行：

        taptap-maker canvas recognition-result --target-dir <项目> --canvas-id <画布> --id <识图卡> --input-file <reply.json>

    输出是 canvas update-nodes 的输入。两轮阶段、图片身份、尺寸、框和父子引用全部校验；
    不完整的结果不能写回为成功。校验失败先检查网页原回复，不自行捏造坐标来通过。

4.  重新读取 canvas pages / inspect 的 page-id 和 revision，将上一步输出保存为 update.json：

        taptap-maker canvas update-nodes --target-dir <项目> --page-id <页面> --canvas-id <画布> --revision <版本> --input-file <update.json>

    查询返回的 operation-id，确认成功；打开「查看标注」，核对 UI 和文字，保存后重开。
    复用自动 Bbox 归档；准备命令成功不等于网页识图成功，结构校验不等于像素级视觉验收。
    用户只要求识图时到此结束，不触发生图、切图或组装。
    已授权整组执行时，以最新 revision 再次 run 原分组并保留 recognition=true，复用已保存结果。
