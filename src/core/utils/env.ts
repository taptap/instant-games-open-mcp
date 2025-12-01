/**
 * 环境变量和配置管理
 *
 * 提供：
 * 1. 类型安全的环境配置访问（EnvConfig 类）
 * 2. 环境端点配置（production/rnd）
 * 3. 环境变量向后兼容层（TDS_MCP_* → TAPTAP_MCP_*）
 */

import * as path from 'node:path';
import * as os from 'node:os';
import process from 'node:process';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 环境端点配置
 */
export interface EnvironmentEndpoints {
  /** API 主机名 */
  apiHost: string;
  /** API 基础 URL */
  apiBaseUrl: string;
  /** OAuth 认证主机名 */
  authHost: string;
  /** 二维码授权页面 URL 前缀 */
  qrcodeBaseUrl: string;
}

// ============================================================================
// 环境端点配置
// ============================================================================

/**
 * 环境端点配置映射
 */
const ENVIRONMENT_ENDPOINTS: Record<string, EnvironmentEndpoints> = {
  production: {
    apiHost: 'agent.tapapis.cn',
    apiBaseUrl: 'https://agent.tapapis.cn',
    authHost: 'accounts.tapapis.cn',
    qrcodeBaseUrl: 'https://www.taptap.cn/tap-qrcode?scene=mcp_auth&code=',
  },
  rnd: {
    apiHost: 'agent.api.xdrnd.cn',
    apiBaseUrl: 'https://agent.api.xdrnd.cn',
    authHost: 'oauth.api.xdrnd.cn',
    qrcodeBaseUrl: 'https://www-beta.xdrnd.cn/tap-qrcode?scene=mcp_auth&code=',
  },
};

// ============================================================================
// 类型安全的环境配置类
// ============================================================================

/**
 * 类型安全的环境配置访问
 *
 * 提供所有环境变量和配置的统一访问入口
 *
 * @example
 * const token = EnvConfig.macToken;
 * const env = EnvConfig.environment;
 * const endpoints = EnvConfig.endpoints;
 */
export class EnvConfig {
  // --------------------------------------------------------------------------
  // 认证配置
  // --------------------------------------------------------------------------

  /** MAC Token（用户认证令牌） */
  static get macToken(): string | undefined {
    return getEnv('TAPTAP_MCP_MAC_TOKEN');
  }

  /** Client ID（应用标识） */
  static get clientId(): string | undefined {
    return getEnv('TAPTAP_MCP_CLIENT_ID');
  }

  /** Client Secret（应用密钥） */
  static get clientSecret(): string | undefined {
    return getEnv('TAPTAP_MCP_CLIENT_SECRET');
  }

  // --------------------------------------------------------------------------
  // 环境配置
  // --------------------------------------------------------------------------

  /** 运行环境（production 或 rnd） */
  static get environment(): 'production' | 'rnd' {
    const env = getEnv('TAPTAP_MCP_ENV', 'production');
    return env === 'rnd' ? 'rnd' : 'production';
  }

  /**
   * 环境端点配置（API 和 OAuth 端点）
   *
   * @example
   * const apiUrl = EnvConfig.endpoints.apiBaseUrl;
   * const authHost = EnvConfig.endpoints.authHost;
   */
  static get endpoints(): EnvironmentEndpoints {
    return ENVIRONMENT_ENDPOINTS[this.environment] || ENVIRONMENT_ENDPOINTS.production;
  }

  /**
   * 获取指定环境的端点配置
   *
   * @param environment - 环境名称（不传则使用当前环境）
   */
  static getEndpoints(environment?: string): EnvironmentEndpoints {
    const env = environment || this.environment;
    return ENVIRONMENT_ENDPOINTS[env] || ENVIRONMENT_ENDPOINTS.production;
  }

  // --------------------------------------------------------------------------
  // 传输配置
  // --------------------------------------------------------------------------

  /** 传输协议（stdio/sse/http） */
  static get transport(): 'stdio' | 'sse' | 'http' {
    const transport = getEnv('TAPTAP_MCP_TRANSPORT', 'stdio').toLowerCase();
    if (['stdio', 'sse', 'http'].includes(transport)) {
      return transport as 'stdio' | 'sse' | 'http';
    }
    return 'stdio';
  }

  /** 服务器端口 */
  static get port(): number {
    return getEnvInt('TAPTAP_MCP_PORT', 3000);
  }

  /** 是否启用详细日志 */
  static get isVerbose(): boolean {
    return getEnvBoolean('TAPTAP_MCP_VERBOSE');
  }

  // --------------------------------------------------------------------------
  // 路径配置
  // --------------------------------------------------------------------------

  /** 缓存目录 */
  static get cacheDir(): string {
    return getEnv('TAPTAP_MCP_CACHE_DIR') || path.join(os.tmpdir(), 'taptap-mcp', 'cache');
  }

  /** 临时文件目录 */
  static get tempDir(): string {
    return getEnv('TAPTAP_MCP_TEMP_DIR') || path.join(os.tmpdir(), 'taptap-mcp', 'temp');
  }

  /** 工作区根目录 */
  static get workspaceRoot(): string {
    return getEnv('TAPTAP_MCP_WORKSPACE_ROOT') || process.cwd();
  }

  // --------------------------------------------------------------------------
  // 其他配置
  // --------------------------------------------------------------------------

  /** 代理配置路径 */
  static get proxyConfig(): string | undefined {
    return getEnv('TAPTAP_MCP_PROXY_CONFIG');
  }
}

// ============================================================================
// 向后兼容层（内部实现）
// ============================================================================

/**
 * 环境变量映射（用于向后兼容）
 */
interface EnvMapping {
  new: string;
  old: string;
  description: string;
}

/**
 * 环境变量映射表（新旧变量名对照）
 */
const ENV_MAPPINGS: EnvMapping[] = [
  { new: 'TAPTAP_MCP_MAC_TOKEN', old: 'TDS_MCP_MAC_TOKEN', description: 'MAC Token' },
  { new: 'TAPTAP_MCP_CLIENT_ID', old: 'TDS_MCP_CLIENT_ID', description: 'Client ID' },
  { new: 'TAPTAP_MCP_CLIENT_SECRET', old: 'TDS_MCP_CLIENT_TOKEN', description: 'Client Secret' },
  { new: 'TAPTAP_MCP_ENV', old: 'TDS_MCP_ENV', description: 'Environment' },
  { new: 'TAPTAP_MCP_TRANSPORT', old: 'TDS_MCP_TRANSPORT', description: 'Transport Protocol' },
  { new: 'TAPTAP_MCP_PORT', old: 'TDS_MCP_PORT', description: 'Server Port' },
  { new: 'TAPTAP_MCP_VERBOSE', old: 'TDS_MCP_VERBOSE', description: 'Verbose Logging' },
  { new: 'TAPTAP_MCP_CACHE_DIR', old: 'TDS_MCP_CACHE_DIR', description: 'Cache Directory' },
  { new: 'TAPTAP_MCP_TEMP_DIR', old: 'TDS_MCP_TEMP_DIR', description: 'Temp Directory' },
  { new: 'TAPTAP_MCP_WORKSPACE_ROOT', old: 'WORKSPACE_ROOT', description: 'Workspace Root' },
  { new: 'TAPTAP_MCP_PROXY_CONFIG', old: 'PROXY_CONFIG', description: 'Proxy Config' },
];

/**
 * 已警告过的废弃变量（避免重复警告）
 */
const deprecationWarned = new Set<string>();

/**
 * 获取环境变量（支持向后兼容）
 *
 * @example
 * // 返回 string | undefined
 * const token = getEnv('TAPTAP_MCP_MAC_TOKEN');
 *
 * // 返回 string（带默认值）
 * const env = getEnv('TAPTAP_MCP_ENV', 'production');
 */
export function getEnv(newKey: string): string | undefined;
export function getEnv(newKey: string, defaultValue: string): string;
export function getEnv(newKey: string, defaultValue?: string): string | undefined {
  const mapping = ENV_MAPPINGS.find((m) => m.new === newKey);

  if (!mapping) {
    // 非映射变量，直接返回
    return process.env[newKey] ?? defaultValue;
  }

  const newValue = process.env[mapping.new];
  const oldValue = process.env[mapping.old];

  // 新变量优先
  if (newValue !== undefined) {
    return newValue;
  }

  // 回退到旧变量（带废弃警告）
  if (oldValue !== undefined) {
    if (!deprecationWarned.has(mapping.old)) {
      console.error(
        `[DEPRECATED] Environment variable "${mapping.old}" is deprecated. Please use "${mapping.new}" instead.`
      );
      deprecationWarned.add(mapping.old);
    }
    return oldValue;
  }

  return defaultValue;
}

/**
 * 获取布尔型环境变量
 */
export function getEnvBoolean(newKey: string, defaultValue = false): boolean {
  const value = getEnv(newKey);
  if (value === undefined) {
    return defaultValue;
  }
  return value === 'true' || value === '1';
}

/**
 * 获取整数型环境变量
 */
export function getEnvInt(newKey: string, defaultValue = 0): number {
  const value = getEnv(newKey);
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 检查是否有废弃的环境变量在使用中
 */
export function checkDeprecatedEnvVars(): string[] {
  const deprecated: string[] = [];

  for (const mapping of ENV_MAPPINGS) {
    if (process.env[mapping.old] && !process.env[mapping.new]) {
      deprecated.push(mapping.old);
    }
  }

  return deprecated;
}

/**
 * 打印废弃警告（用于启动时提示）
 */
export function printDeprecationWarnings(): void {
  const deprecated = checkDeprecatedEnvVars();

  if (deprecated.length > 0) {
    console.error('');
    console.error('⚠️  DEPRECATION WARNING ⚠️');
    console.error('The following environment variables are deprecated:');
    console.error('');

    for (const oldKey of deprecated) {
      const mapping = ENV_MAPPINGS.find((m) => m.old === oldKey);
      if (mapping) {
        console.error(`  ${oldKey} → ${mapping.new}`);
      }
    }

    console.error('');
    console.error('Please update your configuration to use the new variable names.');
    console.error('Old variables will be removed in a future major version.');
    console.error('');
  }
}
