import type { ProxyRuntimeOptions } from '../mcp-proxy/types.js';

export const MAKER_TOOL_CALL_TIMEOUT_MS = 60 * 60 * 1000;

export const MAKER_PROXY_RUNTIME_OPTIONS: Readonly<ProxyRuntimeOptions> = {
  sourceTag: 'local',
  remoteErrorMode: 'tool-result',
  recoveryMode: 'resilient',
};
