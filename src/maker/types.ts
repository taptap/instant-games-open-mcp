/**
 * Shared Maker local MCP types.
 */

export interface MakerJwt {
  token: string;
  token_type?: string;
  expires_at?: string;
  user_id?: string;
  user_name?: string;
  raw?: unknown;
}

export interface MakerPat {
  token: string;
  expires_at?: string;
  user_id?: string;
  user_name?: string;
  raw?: unknown;
}

export interface MakerTapDeviceSession {
  device_code: string;
  qrcode_url: string;
  auth_url: string;
  environment: string;
  expires_at: string;
  interval_seconds: number;
  raw?: unknown;
}

export interface MakerTapAuth {
  kid: string;
  mac_key: string;
  token_type: string;
  mac_algorithm: string;
  raw?: unknown;
}

export interface MakerProjectConfig {
  project_id: string;
  user_id?: string;
  sce_endpoint?: string;
  custom_fields?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export interface MakerProjectSummary {
  id: string;
  name?: string;
  user_id?: string;
  sce_endpoint?: string;
  git_url?: string;
  raw?: unknown;
}

export interface MakerIdentifyResult {
  projectId?: string;
  configPath?: string;
  projectRoot?: string;
  config?: MakerProjectConfig;
  source: 'argv' | 'env' | 'cwd' | 'none';
}
