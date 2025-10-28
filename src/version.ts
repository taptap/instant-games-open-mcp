/**
 * Version management - Single source of truth from package.json
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create require function for ES modules
const require = createRequire(import.meta.url);

// Read version from package.json
const packageJsonPath = join(__dirname, '../package.json');
const packageJson = require(packageJsonPath);

export const VERSION = packageJson.version;
