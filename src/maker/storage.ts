/**
 * Maker local storage helpers.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  MakerJwt,
  MakerPat,
  MakerProjectConfig,
  MakerTapAuth,
  MakerTapDeviceSession,
} from './types.js';

const MAKER_HOME_ENV = 'TAPTAP_MAKER_HOME';
const MAKER_DIR = '.taptap-maker';
const PROJECT_DIR = '.maker-mcp';

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function getMakerHome(): string {
  return process.env[MAKER_HOME_ENV] || path.join(os.homedir(), MAKER_DIR);
}

export function getJwtPath(): string {
  return path.join(getMakerHome(), 'jwt.json');
}

export function getPatPath(): string {
  return path.join(getMakerHome(), 'pat.json');
}

export function getTapDeviceSessionPath(): string {
  return path.join(getMakerHome(), 'tap-device-session.json');
}

export function getTapAuthPath(): string {
  return path.join(getMakerHome(), 'tap-auth.json');
}

export function getLegacyPatPath(): string {
  return path.join(os.homedir(), '.maker-pat');
}

export function loadJwt(): MakerJwt | null {
  const jwt = readJsonFile<MakerJwt>(getJwtPath());
  return jwt?.token ? jwt : null;
}

export function saveJwt(jwt: MakerJwt): void {
  writeJsonFile(getJwtPath(), {
    ...jwt,
    saved_at: new Date().toISOString(),
  });
}

export function clearJwt(): void {
  const jwtPath = getJwtPath();
  if (fs.existsSync(jwtPath)) {
    fs.unlinkSync(jwtPath);
  }
}

export function loadPat(): MakerPat | null {
  const pat = readJsonFile<MakerPat>(getPatPath());
  if (pat?.token) {
    return pat;
  }

  const legacyPatPath = getLegacyPatPath();
  if (fs.existsSync(legacyPatPath)) {
    const token = fs.readFileSync(legacyPatPath, 'utf8').trim();
    if (token) {
      return { token };
    }
  }

  return null;
}

export function savePat(pat: MakerPat): void {
  writeJsonFile(getPatPath(), {
    ...pat,
    saved_at: new Date().toISOString(),
  });

  fs.writeFileSync(getLegacyPatPath(), `${pat.token}\n`, 'utf8');
}

export function clearPat(): void {
  const patPath = getPatPath();
  if (fs.existsSync(patPath)) {
    fs.unlinkSync(patPath);
  }

  const legacyPatPath = getLegacyPatPath();
  if (fs.existsSync(legacyPatPath)) {
    fs.unlinkSync(legacyPatPath);
  }
}

export function loadTapDeviceSession(): MakerTapDeviceSession | null {
  const session = readJsonFile<MakerTapDeviceSession>(getTapDeviceSessionPath());
  return session?.device_code ? session : null;
}

export function saveTapDeviceSession(session: MakerTapDeviceSession): void {
  writeJsonFile(getTapDeviceSessionPath(), {
    ...session,
    saved_at: new Date().toISOString(),
  });
}

export function clearTapDeviceSession(): void {
  const sessionPath = getTapDeviceSessionPath();
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
}

export function loadTapAuth(): MakerTapAuth | null {
  const auth = readJsonFile<MakerTapAuth>(getTapAuthPath());
  return auth?.kid && auth?.mac_key ? auth : null;
}

export function saveTapAuth(auth: MakerTapAuth): void {
  writeJsonFile(getTapAuthPath(), {
    ...auth,
    saved_at: new Date().toISOString(),
  });
}

export function clearTapAuth(): void {
  const authPath = getTapAuthPath();
  if (fs.existsSync(authPath)) {
    fs.unlinkSync(authPath);
  }
}

export function getProjectConfigDir(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_DIR);
}

export function getProjectConfigPath(projectRoot: string): string {
  return path.join(getProjectConfigDir(projectRoot), 'config.json');
}

export function loadProjectConfig(projectRoot: string): MakerProjectConfig | null {
  const config = readJsonFile<MakerProjectConfig>(getProjectConfigPath(projectRoot));
  return config?.project_id ? config : null;
}

export function saveProjectConfig(projectRoot: string, config: MakerProjectConfig): void {
  const now = new Date().toISOString();
  const existing = loadProjectConfig(projectRoot);
  const nextConfig: MakerProjectConfig = {
    ...existing,
    ...config,
    created_at: existing?.created_at || config.created_at || now,
    updated_at: now,
  };

  writeJsonFile(getProjectConfigPath(projectRoot), nextConfig);
  fs.writeFileSync(path.join(getProjectConfigDir(projectRoot), '.gitignore'), '*\n', 'utf8');
}

export function getProjectMarkerDirName(): string {
  return PROJECT_DIR;
}
