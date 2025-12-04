//! Build script for taptap-signer
//!
//! This script handles:
//! 1. NAPI build configuration
//! 2. CLIENT_SECRET obfuscation at compile time
//!
//! The CLIENT_SECRET and CLIENT_ID are read from environment variables
//! during build and XOR-encrypted into the binary.

use std::env;

fn main() {
    // NAPI build configuration
    napi_build::setup();

    // Read secrets from environment at build time
    let client_id = env::var("BUILD_CLIENT_ID")
        .expect("BUILD_CLIENT_ID must be set during build");
    let client_secret = env::var("BUILD_CLIENT_SECRET")
        .expect("BUILD_CLIENT_SECRET must be set during build");

    // Generate XOR key (deterministic based on package name for reproducibility)
    let xor_key = generate_xor_key();

    // Encrypt and output as compile-time constants
    let encrypted_id = xor_encrypt(client_id.as_bytes(), &xor_key);
    let encrypted_secret = xor_encrypt(client_secret.as_bytes(), &xor_key);

    // Pass encrypted values to Rust code via environment
    println!("cargo:rustc-env=ENCRYPTED_CLIENT_ID={}", bytes_to_hex(&encrypted_id));
    println!("cargo:rustc-env=ENCRYPTED_CLIENT_SECRET={}", bytes_to_hex(&encrypted_secret));
    println!("cargo:rustc-env=XOR_KEY={}", bytes_to_hex(&xor_key));
    println!("cargo:rustc-env=CLIENT_ID_LEN={}", client_id.len());
    println!("cargo:rustc-env=CLIENT_SECRET_LEN={}", client_secret.len());

    // Rebuild if secrets change
    println!("cargo:rerun-if-env-changed=BUILD_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=BUILD_CLIENT_SECRET");
}

/// Generate a deterministic XOR key
fn generate_xor_key() -> Vec<u8> {
    // Use a combination of package name and version for key generation
    // This is NOT cryptographically secure, but adds obfuscation
    let seed = b"taptap-signer-v0.1.0-obfuscation-key";
    let mut key = Vec::with_capacity(64);

    for (i, byte) in seed.iter().enumerate() {
        // Simple mixing function
        key.push(byte.wrapping_add((i as u8).wrapping_mul(17)).rotate_left(3));
    }

    // Extend key to 64 bytes
    while key.len() < 64 {
        let last = *key.last().unwrap();
        let second_last = key[key.len() - 2];
        key.push(last.wrapping_add(second_last).wrapping_mul(31));
    }

    key
}

/// XOR encrypt data with key
fn xor_encrypt(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, &byte)| byte ^ key[i % key.len()])
        .collect()
}

/// Convert bytes to hex string
fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
