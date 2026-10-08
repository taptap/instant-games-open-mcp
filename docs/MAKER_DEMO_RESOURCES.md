# Maker 示例资源维护

官方画布模板使用 src/maker/demoResources.json。每个图片/视频一个地址，
不打 ZIP，不增加 MCP tool。编辑器代码和 WASM 随包分发，示例改为外部链接，不再内置。

```text
官方模板入库：添加素材 → prepare（无损压缩 + 像素核对）→ 模板引用 resourceId
上传：本地强制检查 → API 并发上传 → 校验并登记 CDN 地址
发布：资源文件和索引合入 GitHub → 强制验证两个下载源 → 手动发布 npm
使用：校验本地缓存 → 未命中请求 CDN → 失败请求 GitHub → 校验后缓存
```

## 添加和上传

维护机需要 Python 3、Pillow、oxipng、jpegtran；用户安装的 npm 包不需要这些工具。

```bash
node scripts/maker-demo-resources.mjs add /绝对路径/素材.png
npm run maker:resources:prepare
node scripts/maker-demo-resources.mjs upload
```

add 可选第二个文件参数作为列表缩略图。素材按 SHA-256 命名并去重，模板引用 resourceId。
optimize 更新 ID 及已有模板/编辑器引用，PNG 优化编码，JPEG 优化熵编码，不缩放、量化或重新有损编码。
压缩前后逐像素核对 RGBA、尺寸及颜色元数据，变大则保留原字节；验证失败立即停止。
缩略图是单独的列表预览，不用于导入素材或游戏贴图；视频保留原字节。
upload 在本地文件或无损检查不合格时拒绝上传；pending 可只查看待上传列表。

这是官方模板图片的固定入库流程，包括缩略图；新图片先 add，再 prepare，最后引用
prepare 后索引中的 resourceId（压缩会改变文件哈希，已存在的模板引用由 optimize 同步更新）。
prepare 对已有合格记录跳过压缩，不反复处理已上传图片；不能进一步变小时保留原字节，仍记录检查结果。
打包不自动压缩或上传，避免构建临时修改资源身份和 CDN 地址。

Maker bundle 和独立 npm 包准备阶段自动执行同一检查：未压缩、文件哈希不匹配、资源引用缺失、
图片内嵌或未登记 CDN 地址都会阻止打包。可手动运行 check --release 提前检查。
主包和 Maker 的发布 Actions 还必须下载验证 CDN、GitHub 两个来源，任一失败即停止发布。
这只约束随产品维护的官方模板；用户项目里的图片和自定义模板继续读本机，
不会被自动压缩、上传或改写。

上传模块 scripts/maker-demo-upload.mjs 使用公司页面的同一接口：
POST https://tap-android-dev.tapsvc.com/vue-element-admin/uploadCdn，multipart 字段为 file。
默认 4 个文件并发，每个文件一个 CDN 地址；仅处理索引里没有 CDN 地址的资源。
接口已在当前环境验证可以直接调用，不需要 Playwright 运行依赖或导出浏览器凭据。
若接口拒绝授权立即停止派发新请求，保留在途成功结果，检查网络与访问授权后再继续。
上传与打包分开，不在构建或 CI 中上传，也不新增认证服务。

每个成功响应先记录在被 Git 忽略的 .maker/demo-resource-upload.json，
再核对 CDN 文件大小和 SHA-256，通过后立即更新正式索引。校验失败时下次复用地址，
不重复上传；网络中断或进程中断导致结果未知时，先核对，再用 upload --retry-unknown 显式重试。
同一资源库一次只允许一个上传进程；异常退出遗留 .lock 时，确认旧进程已结束后再移除该锁。

如需手动上传，也可在原页面使用 CDN 上传区，之后按下面的方法导入上传结果。

上传结果保存为 JSON 数组，每项为 {"file":"哈希.png","url":"HTTPS CDN 地址"}，
也接受上传页面成功响应的 files / result 记录。然后执行：

```bash
node scripts/maker-demo-resources.mjs record /绝对路径/上传结果.json
node scripts/maker-demo-resources.mjs verify cdn
```

record 下载核对大小和 SHA-256 后才登记公司 CDN 地址；记录中不存在的文件或失败响应会被拒绝。
同一批全部通过才写索引，失败可修正后重跑。旧原图上传地址不能用于已压缩的新哈希文件。

## GitHub 备用与 npm

resources/maker-demo/ 存入公司仓库，但由 npm 排除规则排除。主包 Maker bundle 和
独立 Maker 包/插件只包含资源索引，不包含这些媒体。资源使用 main 上的内容哈希文件名，
哈希变化即新文件，已发布文件必须保留，保证旧版本仍能下载；无需每次发布修改 commit 地址。

资源与索引合入 main 后、发布 npm 前必须执行：

```bash
node scripts/maker-demo-resources.mjs verify cdn
node scripts/maker-demo-resources.mjs verify github
```

GitHub 尚未合入或验证失败时，不应发布依赖该批资源的新包。npm 发布仍沿用现有手动 Actions。

下载模块 src/maker/demoResources.ts 每个源最多尝试一次，超时或校验失败转备用源。
成功文件原子写入 Maker home 下的 cache/demo-resources，相同资源的并发请求合并。
两个源均失败时明确报错，不缓存半文件；已缓存或已导入项目的素材可离线使用。
源码研发和测试优先读取仓库内校验合格的文件，正式 bundle 只使用缓存和远端。

回归：makerDemoResources.test.ts 覆盖回退、缓存、损坏及并发；模板测试覆盖导入和预览，
node scripts/test-maker-ui-editor.mjs 覆盖项目编辑器与外部示例入口。
node --test scripts/test-maker-demo-upload.mjs 覆盖上传协议、并发上限、失败恢复、授权失败及重复运行。
node --test scripts/test-maker-demo-resource-check.mjs 覆盖入库/打包拦截，包括缺压缩记录、文件改动、
未上传、引用缺失和内嵌图片。
