/**
 * Version management - Single source of truth from package.json
 * 
 * Note: When bundling for standalone distribution (e.g., proxy.js),
 * __VERSION__ is injected at build time by esbuild's define option.
 */

// Declare global __VERSION__ for build-time injection
declare const __VERSION__: string | undefined;

let VERSION: string;

// Check if version is injected at build time (for bundled builds)
// @ts-ignore - __VERSION__ is defined at build time by esbuild
if (typeof __VERSION__ !== 'undefined') {
  // @ts-ignore
  VERSION = __VERSION__;
} else {
  // Read from package.json at runtime (for normal builds)
  const { createRequire } = await import('node:module');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Create require function for ES modules
  const require = createRequire(import.meta.url);

  // Read version from package.json
  const packageJsonPath = join(__dirname, '../package.json');
  const packageJson = require(packageJsonPath);
  
  VERSION = packageJson.version;
}

export { VERSION };
