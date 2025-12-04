/**
 * Native Signer Integration
 *
 * This module provides a bridge to the native Rust signer.
 * It handles:
 * - Loading the native module
 * - Fallback to JS implementation (for development)
 * - Error handling and logging
 *
 * ## Security Model
 *
 * In production environment:
 * - CLIENT_ID and CLIENT_SECRET are embedded in the native binary
 * - The native module provides signing without exposing secrets
 *
 * In rnd environment (or development):
 * - Uses environment variables (TAPTAP_MCP_CLIENT_ID, TAPTAP_MCP_CLIENT_SECRET)
 * - Native signer is skipped entirely
 */

import cryptoJS from 'crypto-js';
import { logger } from '../utils/logger.js';
import { EnvConfig } from '../utils/env.js';

// Types for native module
interface NativeSignerModule {
  computeTapSign: (method: string, url: string, headersPart: string, body: string) => string;
  getClientId: () => string;
  verifyIntegrity: () => boolean;
  getVersion: () => string;
}

// Native module state
let nativeModule: NativeSignerModule | null = null;
let loadAttempted = false;
let loadError: Error | null = null;
let usingNative = false;

/**
 * Check if we should use environment variables instead of native signer
 * - rnd environment always uses env vars
 * - If env vars are set, prefer them (development mode)
 */
function shouldUseEnvVars(): boolean {
  // rnd 环境强制使用环境变量
  if (EnvConfig.environment === 'rnd') {
    return true;
  }

  // 如果环境变量已设置，也使用环境变量（开发模式）
  if (EnvConfig.clientId && EnvConfig.clientSecret) {
    return true;
  }

  return false;
}

/**
 * Attempt to load the native signer module
 */
async function loadNativeModule(): Promise<NativeSignerModule | null> {
  if (loadAttempted) {
    return nativeModule;
  }

  loadAttempted = true;

  // 如果应该使用环境变量，跳过 native signer
  if (shouldUseEnvVars()) {
    const env = EnvConfig.environment;
    if (env === 'rnd') {
      await logger.info(`ℹ️  Using environment variables (${env} environment)`);
    } else {
      await logger.info('ℹ️  Using environment variables (development mode)');
    }
    return null;
  }

  // Native module loading path
  // Bundle mode: dist/server.js → dist/native/index.js
  // All artifacts are in dist/ directory for easy distribution
  const importPath = './native/index.js';

  try {
    const native = (await import(importPath)) as NativeSignerModule;

    // Verify the module works
    native.verifyIntegrity();

    nativeModule = native;
    usingNative = true;
    await logger.info(`✅ Native signer loaded (v${native.getVersion()})`);

    return nativeModule;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    loadError = new Error(`${importPath}: ${errorMsg}`);
    await logger.info(`⚠️  Native signer not available: ${errorMsg}`);
    await logger.info('   Set TAPTAP_MCP_CLIENT_ID and TAPTAP_MCP_CLIENT_SECRET');
  }

  return null;
}

/**
 * Initialize the signer (call at startup)
 */
export async function initSigner(): Promise<void> {
  await loadNativeModule();
}

/**
 * Check if native signer is being used
 */
export function isUsingNativeSigner(): boolean {
  return usingNative;
}

/**
 * Get CLIENT_ID from native module or environment
 *
 * @returns CLIENT_ID string
 * @throws Error if neither native module nor environment variable is available
 */
export async function getClientId(): Promise<string> {
  const module = await loadNativeModule();

  if (module) {
    try {
      return module.getClientId();
    } catch (error) {
      await logger.error('Native getClientId failed', error instanceof Error ? error : undefined);
      // Fall through to environment variable
    }
  }

  // Fallback to environment variable
  const envClientId = EnvConfig.clientId;
  if (envClientId) {
    return envClientId;
  }

  throw new Error(
    'CLIENT_ID not available. ' +
      'Build native signer or set TAPTAP_MCP_CLIENT_ID environment variable.'
  );
}

/**
 * Get CLIENT_ID synchronously (after init)
 * For use in synchronous code paths
 */
export function getClientIdSync(): string {
  if (nativeModule) {
    try {
      return nativeModule.getClientId();
    } catch {
      // Fall through
    }
  }

  const envClientId = EnvConfig.clientId;
  if (envClientId) {
    return envClientId;
  }

  throw new Error('CLIENT_ID not available');
}

/**
 * Compute X-Tap-Sign signature
 *
 * @param method - HTTP method
 * @param url - Request URL path with query string
 * @param headersPart - Sorted X-Tap-* headers in format "key:value\nkey:value"
 * @param body - Request body
 * @returns Base64-encoded HMAC-SHA256 signature
 */
export async function computeTapSign(
  method: string,
  url: string,
  headersPart: string,
  body: string
): Promise<string> {
  const module = await loadNativeModule();

  if (module) {
    try {
      return module.computeTapSign(method, url, headersPart, body);
    } catch (error) {
      await logger.error(
        'Native computeTapSign failed',
        error instanceof Error ? error : undefined
      );
      // Fall through to JS implementation
    }
  }

  // Fallback to JS implementation
  return computeTapSignJS(method, url, headersPart, body);
}

/**
 * Compute X-Tap-Sign synchronously (after init)
 * For use in synchronous code paths
 */
export function computeTapSignSync(
  method: string,
  url: string,
  headersPart: string,
  body: string
): string {
  if (nativeModule) {
    try {
      return nativeModule.computeTapSign(method, url, headersPart, body);
    } catch {
      // Fall through
    }
  }

  // Fallback to JS implementation
  return computeTapSignJSSync(method, url, headersPart, body);
}

/**
 * JavaScript fallback implementation of X-Tap-Sign
 *
 * This is used when the native module is not available.
 * WARNING: This requires CLIENT_SECRET in environment variables.
 */
async function computeTapSignJS(
  method: string,
  url: string,
  headersPart: string,
  body: string
): Promise<string> {
  const signingKey = EnvConfig.clientSecret;

  if (!signingKey) {
    throw new Error(
      'Signing key not available. ' +
        'Build native signer or set TAPTAP_MCP_CLIENT_SECRET environment variable.'
    );
  }

  return computeTapSignWithKey(method, url, headersPart, body, signingKey);
}

/**
 * Synchronous JS fallback
 */
function computeTapSignJSSync(
  method: string,
  url: string,
  headersPart: string,
  body: string
): string {
  const signingKey = EnvConfig.clientSecret;

  if (!signingKey) {
    throw new Error('Signing key not available');
  }

  return computeTapSignWithKey(method, url, headersPart, body, signingKey);
}

/**
 * Core signing implementation using crypto-js
 */
function computeTapSignWithKey(
  method: string,
  url: string,
  headersPart: string,
  body: string,
  signingKey: string
): string {
  const signParts = `${method}\n${url}\n${headersPart}\n${body}\n`;
  const hmacResult = cryptoJS.HmacSHA256(signParts, signingKey);

  if (!hmacResult || hmacResult.sigBytes === undefined) {
    throw new Error('HMAC-SHA256 failed');
  }

  return cryptoJS.enc.Base64.stringify(hmacResult);
}

/**
 * Get signer status information
 */
export async function getSignerStatus(): Promise<{
  native: boolean;
  version: string | null;
  error: string | null;
  fallbackAvailable: boolean;
}> {
  const module = await loadNativeModule();
  const hasEnvFallback = !!(EnvConfig.clientId && EnvConfig.clientSecret);

  return {
    native: module !== null,
    version: module ? module.getVersion() : null,
    error: loadError ? loadError.message : null,
    fallbackAvailable: hasEnvFallback,
  };
}

/**
 * Check if signer is available (native or fallback)
 */
export async function isSignerAvailable(): Promise<boolean> {
  const module = await loadNativeModule();
  if (module) return true;

  return !!(EnvConfig.clientId && EnvConfig.clientSecret);
}
