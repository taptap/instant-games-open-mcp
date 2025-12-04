//! TapTap Native Signer
//!
//! This module provides secure signing functions for TapTap MCP Server.
//! The CLIENT_SECRET is embedded in the binary at compile time with XOR obfuscation.
//!
//! ## Security Model
//!
//! - CLIENT_SECRET is XOR-encrypted at compile time
//! - Decryption happens only when needed, in memory
//! - Anti-debugging checks (optional, for production builds)
//! - Binary stripping and LTO enabled in release builds
//!
//! ## Exposed Functions
//!
//! - `computeTapSign`: Generate X-Tap-Sign header using CLIENT_SECRET
//! - `getClientId`: Get the embedded CLIENT_ID
//! - `verifyIntegrity`: Check if the module is intact

#![deny(clippy::all)]

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use hmac::{Hmac, Mac};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use sha2::Sha256;

// Compile-time encrypted values (set by build.rs)
const ENCRYPTED_CLIENT_ID: &str = env!("ENCRYPTED_CLIENT_ID");
const ENCRYPTED_CLIENT_SECRET: &str = env!("ENCRYPTED_CLIENT_SECRET");
const XOR_KEY: &str = env!("XOR_KEY");
const CLIENT_ID_LEN: &str = env!("CLIENT_ID_LEN");
const CLIENT_SECRET_LEN: &str = env!("CLIENT_SECRET_LEN");

/// Internal: Decrypt XOR-encrypted data
fn decrypt_secret(encrypted_hex: &str, key_hex: &str, expected_len: usize) -> Vec<u8> {
    let encrypted = hex_to_bytes(encrypted_hex);
    let key = hex_to_bytes(key_hex);

    let decrypted: Vec<u8> = encrypted
        .iter()
        .enumerate()
        .map(|(i, &byte)| byte ^ key[i % key.len()])
        .collect();

    // Only return expected length to avoid any padding issues
    decrypted[..expected_len].to_vec()
}

/// Internal: Convert hex string to bytes
fn hex_to_bytes(hex: &str) -> Vec<u8> {
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap_or(0))
        .collect()
}

/// Internal: Get decrypted CLIENT_SECRET
fn get_client_secret() -> Vec<u8> {
    let len: usize = CLIENT_SECRET_LEN.parse().unwrap_or(0);
    decrypt_secret(ENCRYPTED_CLIENT_SECRET, XOR_KEY, len)
}

/// Internal: Get decrypted CLIENT_ID
fn get_client_id_internal() -> Vec<u8> {
    let len: usize = CLIENT_ID_LEN.parse().unwrap_or(0);
    decrypt_secret(ENCRYPTED_CLIENT_ID, XOR_KEY, len)
}

/// Compute X-Tap-Sign signature
///
/// This function generates the X-Tap-Sign header value using the embedded CLIENT_SECRET.
///
/// ## Signature Format
///
/// ```text
/// sign_parts = "{method}\n{url}\n{headers_part}\n{body}\n"
/// signature = base64(HMAC-SHA256(sign_parts, CLIENT_SECRET))
/// ```
///
/// ## Arguments
///
/// * `method` - HTTP method (GET, POST, etc.)
/// * `url` - Request URL path with query string (e.g., "/api/v1/apps?client_id=xxx")
/// * `headers_part` - Sorted X-Tap-* headers in format "key:value\nkey:value"
/// * `body` - Request body (empty string for GET requests)
///
/// ## Returns
///
/// Base64-encoded HMAC-SHA256 signature
///
/// ## Example
///
/// ```javascript
/// const signature = computeTapSign(
///   "POST",
///   "/api/v1/apps?client_id=xxx",
///   "x-tap-nonce:abc123\nx-tap-ts:1234567890",
///   '{"name":"test"}'
/// );
/// ```
#[napi]
pub fn compute_tap_sign(
    method: String,
    url: String,
    headers_part: String,
    body: String,
) -> Result<String> {
    // Anti-debugging check (optional, uncomment for production)
    // #[cfg(not(debug_assertions))]
    // if is_debugger_present() {
    //     return Err(Error::from_reason("Security check failed"));
    // }

    let secret = get_client_secret();

    if secret.is_empty() {
        return Err(Error::from_reason(
            "Signing key not available. Binary may be corrupted.",
        ));
    }

    // Build signature string (matches TypeScript implementation)
    let sign_parts = format!("{}\n{}\n{}\n{}\n", method, url, headers_part, body);

    // Compute HMAC-SHA256
    let mut mac = Hmac::<Sha256>::new_from_slice(&secret)
        .map_err(|e| Error::from_reason(format!("HMAC initialization failed: {}", e)))?;

    mac.update(sign_parts.as_bytes());

    // Return base64-encoded signature
    let result = mac.finalize();
    let signature = BASE64.encode(result.into_bytes());

    Ok(signature)
}

/// Get the embedded CLIENT_ID
///
/// This returns the CLIENT_ID that was embedded at compile time.
/// Useful for the MCP server to include in API requests.
///
/// ## Returns
///
/// The CLIENT_ID as a string
///
/// ## Example
///
/// ```javascript
/// const clientId = getClientId();
/// // Use in API requests: ?client_id=${clientId}
/// ```
#[napi]
pub fn get_client_id() -> Result<String> {
    let id_bytes = get_client_id_internal();

    if id_bytes.is_empty() {
        return Err(Error::from_reason(
            "Client ID not available. Binary may be corrupted.",
        ));
    }

    String::from_utf8(id_bytes)
        .map_err(|e| Error::from_reason(format!("Invalid CLIENT_ID encoding: {}", e)))
}

/// Verify module integrity
///
/// Performs basic checks to ensure the native module is intact and functional.
///
/// ## Returns
///
/// `true` if the module is functional, throws error otherwise
///
/// ## Example
///
/// ```javascript
/// try {
///   const ok = verifyIntegrity();
///   console.log('Native signer is ready');
/// } catch (e) {
///   console.error('Native signer failed integrity check:', e);
/// }
/// ```
#[napi]
pub fn verify_integrity() -> Result<bool> {
    // Check that secrets can be decrypted
    let id = get_client_id_internal();
    let secret = get_client_secret();

    if id.is_empty() || secret.is_empty() {
        return Err(Error::from_reason("Integrity check failed: missing secrets"));
    }

    // Verify HMAC functionality
    let test_result = compute_tap_sign(
        "GET".to_string(),
        "/test".to_string(),
        "".to_string(),
        "".to_string(),
    );

    if test_result.is_err() {
        return Err(Error::from_reason("Integrity check failed: HMAC error"));
    }

    Ok(true)
}

/// Get version information
///
/// Returns the version of the native signer module.
///
/// ## Returns
///
/// Version string in format "x.y.z"
#[napi]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ============================================================================
// Anti-debugging measures (optional, uncomment for production builds)
// ============================================================================

#[cfg(target_os = "linux")]
#[allow(dead_code)]
fn is_debugger_present() -> bool {
    use std::fs;

    // Check /proc/self/status for TracerPid
    if let Ok(status) = fs::read_to_string("/proc/self/status") {
        for line in status.lines() {
            if line.starts_with("TracerPid:") {
                let pid: i32 = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                return pid != 0;
            }
        }
    }
    false
}

#[cfg(target_os = "macos")]
#[allow(dead_code)]
fn is_debugger_present() -> bool {
    // On macOS, we can check sysctl for P_TRACED flag
    // This is a simplified check; production code might use more robust methods
    use std::process::Command;

    if let Ok(output) = Command::new("ps")
        .args(["-p", &std::process::id().to_string(), "-o", "stat="])
        .output()
    {
        let stat = String::from_utf8_lossy(&output.stdout);
        // 'T' in stat indicates traced/stopped
        return stat.contains('T');
    }
    false
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
fn is_debugger_present() -> bool {
    // Windows-specific debugger detection would go here
    // For now, return false
    false
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
#[allow(dead_code)]
fn is_debugger_present() -> bool {
    false
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_to_bytes() {
        assert_eq!(hex_to_bytes("48656c6c6f"), b"Hello".to_vec());
        assert_eq!(hex_to_bytes(""), Vec::<u8>::new());
    }

    #[test]
    fn test_xor_roundtrip() {
        let original = b"test_secret_123";
        let key = b"some_key_for_xor";

        // Encrypt
        let encrypted: Vec<u8> = original
            .iter()
            .enumerate()
            .map(|(i, &byte)| byte ^ key[i % key.len()])
            .collect();

        // Decrypt
        let decrypted: Vec<u8> = encrypted
            .iter()
            .enumerate()
            .map(|(i, &byte)| byte ^ key[i % key.len()])
            .collect();

        assert_eq!(original.to_vec(), decrypted);
    }
}
