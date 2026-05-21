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
  build_local_changes_policy?: 'ask' | 'auto_submit';
  created_at?: string;
  updated_at?: string;
}

export interface MakerProjectSummary {
  /** Maker app id. */
  id: string;
  /** 游戏名称。 */
  name?: string;
  userId?: string;
  user_id?: string;
  /** 创建时间。 */
  createdAt?: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  gameType?: string;
  icon?: number;
  iconColor?: number;
  lastAccessedAt?: string | null;
  /** 最后修改时间，用于识别最近活跃的游戏。 */
  lastConversationAt?: string;
  metadata?: unknown;
  pinnedAt?: string | null;
  stage?: string;
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
