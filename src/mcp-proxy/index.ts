#!/usr/bin/env node

/**
 * TapTap MCP Proxy - stdio 模式
 *
 * 作为 Claude Agent 的子进程运行，通过 stdio 通信
 * 连接到 TapTap MCP Server，自动注入 MAC Token
 *
 * 配置传递方式（任选其一）：
 * 1. 命令行参数：node index.js '{"server":{...}}'
 * 2. 标准输入：echo '{"server":{...}}' | node index.js
 * 3. 环境变量：PROXY_CONFIG='{"server":{...}}' node index.js
 */

import { TapTapMCPProxy } from './proxy.js';
import { loadConfig } from './config.js';

/**
 * 主函数
 */
async function main() {
  try {
    // 1. 加载配置（自动检测来源）
    const config = await loadConfig();

    console.error(`[Proxy] Configuration loaded successfully`);
    console.error(`[Proxy] Server: ${config.server.url}`);
    console.error(`[Proxy] Environment: ${config.server.env}`);
    console.error(`[Proxy] Project: ${config.tenant.project_id}`);
    console.error(`[Proxy] User: ${config.tenant.user_id}`);
    console.error(`[Proxy] Workspace: ${config.tenant.workspace_path}`);
    console.error(`[Proxy] Verbose: ${config.options?.verbose}`);

    // 2. 创建并启动 Proxy
    const proxy = new TapTapMCPProxy(config);
    await proxy.start();

    // 3. 处理进程信号
    const cleanup = () => {
      console.error('[Proxy] Shutting down...');
      proxy.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (error) {
    console.error('[Proxy] Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// 启动
main();
