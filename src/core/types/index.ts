/**
 * Type definitions for TapTap MCP Server
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * MAC Token interface
 * Used for MAC (Message Authentication Code) Token authentication
 */
export interface MacToken {
  /** mac_key id, The key identifier */
  kid: string;

  /** Token type, such as "mac" */
  token_type: string;

  /** mac key */
  mac_key: string;

  /** mac algorithm name, such as "hmac-sha-1" */
  mac_algorithm: string;
}

/**
 * Handler Context
 * Passed to all tool handlers
 *
 * 优先级顺序（从高到低）：
 * 1. 私有参数注入（_developer_id, _app_id 等）
 * 2. HandlerContext 字段
 * 3. 本地缓存或环境变量
 */
export interface HandlerContext {
  // === 认证层 ===
  /** MAC Token for authentication */
  macToken?: MacToken;

  /** User ID for multi-tenant scenarios */
  userId?: string;

  // === 应用上下文层 ===
  /** Developer ID */
  developerId?: number;

  /** App ID */
  appId?: number;

  /** Project Path (for file system access) */
  projectPath?: string;

  // === 追踪层 ===
  /** Tenant ID for multi-tenant scenarios */
  tenantId?: string;

  /** Trace ID for distributed tracing */
  traceId?: string;

  /** Request ID for logging */
  requestId?: string;

  /** Session ID for request tracking */
  sessionId?: string;
}

/**
 * Tool Registration Interface
 * Combines tool definition and handler in a single object
 */
export interface ToolRegistration<T = any> {
  /** MCP Tool definition (JSON Schema) */
  definition: Tool;

  /** Tool handler function */
  handler: (args: T, context: HandlerContext) => Promise<string>;

  /** Whether this tool requires authentication */
  requiresAuth?: boolean;
}

/**
 * Resource Registration Interface
 * Combines resource definition and handler in a single object
 */
export interface ResourceRegistration {
  /** Resource URI */
  uri: string;

  /** Resource name */
  name: string;

  /** Resource description */
  description?: string;

  /** MIME type */
  mimeType?: string;

  /** Resource handler function */
  handler: (args?: any) => Promise<string>;
}

/**
 * Prompt Registration Interface
 * Combines prompt definition and handler in a single object
 */
export interface PromptRegistration {
  /** Prompt name */
  name: string;

  /** Prompt description */
  description?: string;

  /** Prompt arguments */
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;

  /** Prompt handler function */
  handler: (args?: any) => Promise<{
    messages: Array<{
      role: string;
      content: {
        type: string;
        text: string;
      };
    }>;
  }>;
}

/**
 * Feature Module Interface
 * Represents a complete feature module with tools, resources, and prompts
 */
export interface FeatureModule {
  /** Module name */
  name: string;

  /** Tools provided by this module */
  tools: ToolRegistration[];

  /** Resources provided by this module */
  resources: ResourceRegistration[];

  /** Prompts provided by this module (optional) */
  prompts?: PromptRegistration[];
}
