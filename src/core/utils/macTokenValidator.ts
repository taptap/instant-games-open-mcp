/**
 * MAC Token Validation Utilities
 * Provides type-safe validation for MacToken
 */

import type { MacToken } from '../types/index.js';

/**
 * Type guard to check if a value is a valid MacToken
 * @param token - Value to check
 * @returns True if token has all required fields with correct types
 */
export function isValidMacToken(token: any): token is MacToken {
  return !!(
    token &&
    typeof token === 'object' &&
    typeof token.kid === 'string' &&
    token.kid.length > 0 &&
    typeof token.mac_key === 'string' &&
    token.mac_key.length > 0 &&
    typeof token.token_type === 'string' &&
    typeof token.mac_algorithm === 'string'
  );
}

/**
 * Validate MacToken and throw descriptive error if invalid
 * @param token - Token to validate
 * @param source - Source description for error message (e.g., "environment variable", "OAuth response")
 * @throws Error with detailed message if validation fails
 */
export function validateMacToken(token: any, source: string = 'unknown'): asserts token is MacToken {
  if (!token) {
    throw new Error(`Invalid MAC Token from ${source}: token is null or undefined`);
  }

  if (typeof token !== 'object') {
    throw new Error(`Invalid MAC Token from ${source}: token must be an object, got ${typeof token}`);
  }

  const errors: string[] = [];

  if (!token.kid || typeof token.kid !== 'string') {
    errors.push('kid (string) is required');
  }

  if (!token.mac_key || typeof token.mac_key !== 'string') {
    errors.push('mac_key (string) is required');
  }

  if (!token.token_type || typeof token.token_type !== 'string') {
    errors.push('token_type (string) is required');
  }

  if (!token.mac_algorithm || typeof token.mac_algorithm !== 'string') {
    errors.push('mac_algorithm (string) is required');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid MAC Token from ${source}: ${errors.join(', ')}`);
  }
}

/**
 * Safely parse MAC Token from JSON string
 * @param jsonStr - JSON string to parse
 * @param source - Source description for error message
 * @returns Validated MacToken or null if parsing fails or string is empty
 */
export function parseMacToken(jsonStr: string, source: string = 'unknown'): MacToken | null {
  if (!jsonStr || jsonStr.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate the parsed token
    if (isValidMacToken(parsed)) {
      return parsed;
    }

    // Invalid format - log warning but don't throw
    process.stderr.write(`⚠️  Invalid MAC Token format from ${source}, will use OAuth flow\n`);
    return null;
  } catch (error) {
    // JSON parse error - log warning but don't throw
    process.stderr.write(`⚠️  Failed to parse MAC Token from ${source}, will use OAuth flow\n`);
    return null;
  }
}

/**
 * Check if MacToken is empty (missing required fields)
 * @param token - Token to check
 * @returns True if token is effectively empty or invalid
 */
export function isEmptyMacToken(token: any): boolean {
  return !token || !token.kid || !token.mac_key;
}
