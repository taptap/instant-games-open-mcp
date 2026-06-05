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
import { type MakerEnvironment } from './config.js';

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

export function getJwtPath(environment?: MakerEnvironment): string {
  return getMakerCredentialPath('jwt.json', environment);
}

export function getPatPath(environment?: MakerEnvironment): string {
  return getMakerCredentialPath('pat.json', environment);
}

export function getTapDeviceSessionPath(environment?: MakerEnvironment): string {
  return getMakerCredentialPath('tap-device-session.json', environment);
}

export function getTapAuthPath(environment?: MakerEnvironment): string {
  return getMakerCredentialPath('tap-auth.json', environment);
}

export function getLegacyPatPath(): string {
  return path.join(os.homedir(), '.maker-pat');
}

export function loadJwt(environment?: MakerEnvironment): MakerJwt | null {
  const jwt = readJsonFile<MakerJwt>(getJwtPath(environment));
  return jwt?.token ? jwt : null;
}

export function saveJwt(jwt: MakerJwt, environment?: MakerEnvironment): void {
  writeJsonFile(getJwtPath(environment), {
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

export function loadPat(environment?: MakerEnvironment): MakerPat | null {
  const pat = readJsonFile<MakerPat>(getPatPath(environment));
  if (pat?.token) {
    return pat;
  }

  const legacyJsonPat = readJsonFile<MakerPat>(path.join(getMakerHome(), 'pat.json'));
  if (legacyJsonPat?.token) {
    return legacyJsonPat;
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

export function savePat(pat: MakerPat, environment?: MakerEnvironment): void {
  writeJsonFile(getPatPath(environment), {
    ...pat,
    saved_at: new Date().toISOString(),
  });
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

export function loadTapDeviceSession(environment?: MakerEnvironment): MakerTapDeviceSession | null {
  const session = readJsonFile<MakerTapDeviceSession>(getTapDeviceSessionPath(environment));
  return session?.device_code ? session : null;
}

export function saveTapDeviceSession(
  session: MakerTapDeviceSession,
  environment?: MakerEnvironment
): void {
  writeJsonFile(getTapDeviceSessionPath(environment), {
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

export function loadTapAuth(environment?: MakerEnvironment): MakerTapAuth | null {
  const auth = readJsonFile<MakerTapAuth>(getTapAuthPath(environment));
  return auth?.kid && auth?.mac_key ? auth : null;
}

export function saveTapAuth(auth: MakerTapAuth, environment?: MakerEnvironment): void {
  writeJsonFile(getTapAuthPath(environment), {
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

function getMakerCredentialPath(fileName: string, environment?: MakerEnvironment): string {
  void environment;
  return path.join(getMakerHome(), fileName);
}
