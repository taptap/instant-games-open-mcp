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

// ============================================================================
// Context Types - 已移至 context.ts
// ============================================================================
export type {
  RequestContext,
  AppContext,
  SessionContext,
  TokenSource
} from './context.js';
export { ResolvedContext, getTokenSourceLabel } from './context.js';

// 向后兼容别名（将逐步废弃）
export type { RequestContext as HandlerContext } from './context.js';

/**
 * Tool Registration Interface
 * Combines tool definition and handler in a single object
 */
export interface ToolRegistration<T = any> {
  /** MCP Tool definition (JSON Schema) */
  definition: Tool;

  /** Tool handler function - 接受 ResolvedContext */
  handler: (args: T, context: ResolvedContext) => Promise<string>;

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
