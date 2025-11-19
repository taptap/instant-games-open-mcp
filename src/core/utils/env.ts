/**
 * Environment variables compatibility layer
 *
 * Provides backward compatibility for renamed environment variables.
 * Old TDS_MCP_* variables are deprecated in favor of TAPTAP_MCP_*.
 */

interface EnvMapping {
  new: string;
  old: string;
  description: string;
}

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

const deprecationWarned = new Set<string>();

/**
 * Get environment variable with backward compatibility
 *
 * Function overloads:
 * - getEnv(key): returns string | undefined (same as process.env[key])
 * - getEnv(key, defaultValue): returns string (guaranteed non-undefined)
 */
export function getEnv(newKey: string): string | undefined;
export function getEnv(newKey: string, defaultValue: string): string;
export function getEnv(newKey: string, defaultValue?: string): string | undefined {
  const mapping = ENV_MAPPINGS.find(m => m.new === newKey);

  if (!mapping) {
    // Not a mapped variable, return directly
    return process.env[newKey] ?? defaultValue;
  }

  const newValue = process.env[mapping.new];
  const oldValue = process.env[mapping.old];

  // New variable takes precedence
  if (newValue !== undefined) {
    return newValue;
  }

  // Fall back to old variable with deprecation warning
  if (oldValue !== undefined) {
    if (!deprecationWarned.has(mapping.old)) {
      console.error(`[DEPRECATED] Environment variable "${mapping.old}" is deprecated. Please use "${mapping.new}" instead.`);
      deprecationWarned.add(mapping.old);
    }
    return oldValue;
  }

  return defaultValue;
}

/**
 * Get boolean environment variable with backward compatibility
 * @param newKey - New environment variable name
 * @param defaultValue - Default value if not set
 * @returns Boolean value
 */
export function getEnvBoolean(newKey: string, defaultValue = false): boolean {
  const value = getEnv(newKey);
  if (value === undefined) {
    return defaultValue;
  }
  return value === 'true' || value === '1';
}

/**
 * Get integer environment variable with backward compatibility
 * @param newKey - New environment variable name
 * @param defaultValue - Default value if not set
 * @returns Integer value
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
 * Check if any deprecated environment variables are in use
 * @returns Array of deprecated variables currently in use
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
 * Print all deprecated environment variables in use (for startup warning)
 */
export function printDeprecationWarnings(): void {
  const deprecated = checkDeprecatedEnvVars();

  if (deprecated.length > 0) {
    console.error('');
    console.error('⚠️  DEPRECATION WARNING ⚠️');
    console.error('The following environment variables are deprecated:');
    console.error('');

    for (const oldKey of deprecated) {
      const mapping = ENV_MAPPINGS.find(m => m.old === oldKey);
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
