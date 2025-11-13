/**
 * MCP Proxy 配置加载和验证
 *
 * 支持三种配置传递方式（按优先级）：
 * 1. 命令行参数：node index.js '{"server":{...}}'
 * 2. 标准输入：echo '{"server":{...}}' | node index.js
 * 3. 环境变量：PROXY_CONFIG='{"server":{...}}' node index.js
 */

import type { ProxyConfig, MacToken } from './types.js';

/**
 * 从标准输入读取数据
 */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    process.stdin.on('data', (chunk) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    process.stdin.on('error', reject);

    // 5 秒超时
    setTimeout(() => {
      reject(new Error('Timeout reading from stdin'));
    }, 5000);
  });
}

/**
 * 加载配置（自动检测来源）
 *
 * @returns 解析并验证后的配置对象
 * @throws 配置缺失、格式错误或验证失败
 */
export async function loadConfig(): Promise<ProxyConfig> {
  let configJson: string;
  let source: string;

  // 优先级 1: 命令行参数
  if (process.argv[2]) {
    configJson = process.argv[2];
    source = 'command line argument';
  }
  // 优先级 2: 标准输入
  else if (!process.stdin.isTTY) {
    configJson = await readStdin();
    source = 'stdin';
  }
  // 优先级 3: 环境变量
  else if (process.env.PROXY_CONFIG) {
    configJson = process.env.PROXY_CONFIG;
    source = 'PROXY_CONFIG environment variable';
  }
  // 无配置
  else {
    throw new Error(
      'No configuration provided. Please use one of:\n' +
      '1. Command line: node index.js \'{"server":{...}}\'\n' +
      '2. Stdin: echo \'{"server":{...}}\' | node index.js\n' +
      '3. Env var: PROXY_CONFIG=\'{"server":{...}}\' node index.js\n\n' +
      'See config.example.json for configuration format.'
    );
  }

  console.error(`[Proxy] Loading config from ${source}`);

  // 解析 JSON
  let config: ProxyConfig;
  try {
    config = JSON.parse(configJson) as ProxyConfig;
  } catch (error) {
    throw new Error(
      `Failed to parse configuration JSON: ${error instanceof Error ? error.message : String(error)}\n` +
      `Received: ${configJson.substring(0, 100)}...`
    );
  }

  // 验证配置
  validateConfig(config);

  // 应用默认值
  return applyDefaults(config);
}

/**
 * 验证配置完整性
 */
function validateConfig(config: ProxyConfig): void {
  const errors: string[] = [];

  // 验证 server
  if (!config.server) {
    errors.push('- Missing required field: server');
  } else {
    if (!config.server.url) {
      errors.push('- Missing required field: server.url');
    }
    if (config.server.env && !['rnd', 'production'].includes(config.server.env)) {
      errors.push('- Invalid server.env: must be "rnd" or "production"');
    }
  }

  // 验证 tenant
  if (!config.tenant) {
    errors.push('- Missing required field: tenant');
  } else {
    if (!config.tenant.user_id) {
      errors.push('- Missing required field: tenant.user_id');
    }
    if (!config.tenant.project_id) {
      errors.push('- Missing required field: tenant.project_id');
    }
  }

  // 验证 auth
  if (!config.auth) {
    errors.push('- Missing required field: auth');
  } else {
    if (!config.auth.kid) {
      errors.push('- Missing required field: auth.kid');
    }
    if (!config.auth.mac_key) {
      errors.push('- Missing required field: auth.mac_key');
    }
    if (config.auth.token_type !== 'mac') {
      errors.push('- Invalid auth.token_type: must be "mac"');
    }
    if (config.auth.mac_algorithm !== 'hmac-sha-1') {
      errors.push('- Invalid auth.mac_algorithm: must be "hmac-sha-1"');
    }
  }

  if (errors.length > 0) {
    throw new Error('Invalid configuration:\n' + errors.join('\n'));
  }
}

/**
 * 应用默认值
 */
function applyDefaults(config: ProxyConfig): ProxyConfig {
  return {
    server: {
      url: config.server.url,
      env: config.server.env || 'rnd',
    },
    tenant: {
      user_id: config.tenant.user_id,
      project_id: config.tenant.project_id,
      workspace_path: config.tenant.workspace_path || '/workspace',
      project_relative_path: config.tenant.project_relative_path,  // 保留可选字段
    },
    auth: config.auth,
    options: {
      verbose: config.options?.verbose ?? false,
      reconnect_interval: config.options?.reconnect_interval ?? 5000,
      request_timeout: config.options?.request_timeout ?? 30000,
    },
  };
}
