# DSH 插件市场与分发入口

本文件用于区分 DeepSeek Harness（DSH）官方能力、社区插件目录和第三方市场，避免把不同项目误认为同一个“官方插件市场”。

## 结论先看

- DSH 官方仓库是 [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)。官方仓库没有指定唯一的插件市场，也没有把某个社区市场作为官方背书。
- DSH 官方支持的安装协议是 `dsh plugin --profile <profile> add <npm 包名或 GitHub spec>`。npm 包和 GitHub 仓库都可以直接安装。
- 当前社区主链路是 [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) curated registry，再由 [`dsh-market`](https://github.com/dsh-market/dsh-market) 提供 DSH 内置的可视化市场 UI。
- [`deepseek1024.com`](https://deepseek1024.com/) 对应的 [`imsai-sh/awesome-deepseek-harness-plugins`](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) 是第三方社区市场，不是 DeepSeek 官方市场，也不是 DSH 官方 CLI 的默认 registry。

## 市场与仓库

| 项目                                                                                                                                                          | 定位                                    | 是否 DeepSeek 官方 | 插件提交/更新方式                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)                                                                             | DSH 官方运行时、CLI 和插件协议          | 是                 | 不向此仓库提交社区插件目录条目；按官方 `dsh.bundle` 规范发布 npm/GitHub 插件                                          |
| [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)                                                                              | 社区 curated 插件目录和 registry 数据源 | 否                 | 为插件仓库提交一个 `data/plugins/*.yml` PR；npm 包名由 registry 根据 `repository` 元数据自动发现，不要手写 `npm` 字段 |
| [`dsh-market`](https://github.com/dsh-market/dsh-market)                                                                                                      | DSH 内置可视化插件市场 UI               | 否                 | 不直接向该仓库提交插件条目；它读取 `awesome-dsh-plugin` 的公开 registry                                               |
| [`imsai-sh/awesome-deepseek-harness-plugins`](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) / [`deepseek1024.com`](https://deepseek1024.com/) | 第三方自动收集目录、市场和 API          | 否                 | 可按其自身规则提交，但这不等于进入 DSH 社区主目录                                                                     |
| [`zhu1090093659/dsh-web`](https://github.com/zhu1090093659/dsh-web)                                                                                           | 第三方 DSH Web 聚合项目                 | 否                 | 独立项目规则；不是 DSH 官方 registry                                                                                  |

## 本插件的正确路径

本仓库的 DSH 插件是 `packages/dsh-maker`，npm 包为 `@taptap/dsh-maker`。

1. 直接安装或验证：

   ```bash
   dsh plugin --profile web add @taptap/dsh-maker
   ```

2. 社区主目录收录 PR：
   [awesome-dsh-plugin#3296](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/3296)

3. PR 合并后，`dsh-market` 会在其 registry 刷新后自动显示该插件；npm 新版本发布不需要重复提交目录 PR。

4. 1024Store 可以作为额外的第三方分发渠道，但它的收录状态不能代表 DSH 官方或社区主目录状态。

## 本地参考仓库

为方便维护者核对市场机制，相关仓库应 clone 到本仓库同级目录，不放入本仓库 Git 历史：

- `../awesome-dsh-plugin`：社区 curated registry。
- `../dsh-market`：基于该 registry 的 DSH 内置市场 UI。
- `../awesome-deepseek-harness-plugins`：第三方 1024Store 目录和市场实现。
- `../dsh-web`：第三方 DSH Web 聚合项目。

这些 clone 仅用于阅读和验证，不作为本仓库的运行时依赖，也不应提交到本仓库。

## 以后如何判断

- 看到 `deepseek-ai/deepseek-harness`：这是 DSH 官方协议和 CLI 的来源。
- 看到 `awesome-dsh-plugin`：这是社区目录收录入口。
- 看到 `dsh-market`：这是社区市场 UI，不是官方运营市场。
- 看到 `deepseek1024.com`：这是第三方市场，不能替代社区主目录 PR。
- 只想安装插件时，优先使用 npm 包名或 GitHub spec 直接运行官方 `dsh plugin` 命令。
