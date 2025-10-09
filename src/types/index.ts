/**
 * Type definitions for TapTap MCP Server
 */

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
