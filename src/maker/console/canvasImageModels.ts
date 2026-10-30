import { createHmac, randomBytes } from 'node:crypto';
import type { CanvasImageModels } from '../../../packages/maker-canvas/src/contracts.js';
import { createRemoteProxyContext, MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES } from '../server/mcp.js';
import type { MakerRemoteProxyManager } from '../server/remoteProxyManager.js';
import { generationProvider } from './visionSettings.js';
import { ConsoleError } from './types.js';

// A process-private key makes legacy and current profile identities opaque.
// Restarting invalidates open selections so they must be confirmed again.
const providerIdentityKey = randomBytes(32);
export function canvasImageProviderIdentity(configured = generationProvider()): string {
  return createHmac('sha256', providerIdentityKey)
    .update(
      JSON.stringify(configured.source === 'custom' ? configured : { source: configured.source })
    )
    .digest('hex');
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Discover only tool metadata; no model execution or provider fallback. */
export async function canvasImageModels(
  root: string,
  manager: MakerRemoteProxyManager,
  tool: 'generate_image' | 'edit_image',
  configured = generationProvider()
): Promise<CanvasImageModels> {
  if (configured.source !== 'maker') {
    const profile = configured.source === 'custom' ? configured.profile : undefined;
    return {
      provider: {
        source: configured.source,
        identity: canvasImageProviderIdentity(configured),
        ...(profile ? { profileId: profile.id, model: profile.model } : {}),
      },
      tool,
      origin: 'settings',
      label:
        configured.source === 'local'
          ? '当前 AI 客户端（仅 CLI 调用）'
          : profile
            ? profile.name + ' · ' + profile.model
            : '自定义 API 尚未配置',
      models: profile ? [{ id: profile.model, label: profile.model }] : [],
    };
  }
  const context = createRemoteProxyContext({
    targetDir: root,
    exposedTools: MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES,
  });
  let tools;
  try {
    tools = manager.getCachedTools(context) || (await manager.listTools(context));
  } catch (error) {
    if (error instanceof ConsoleError) throw error;
    throw new ConsoleError(
      '无法读取 Maker MCP 生图模型，请检查 Maker 登录与连接后重新打开图片参数；未切换模型来源。',
      503
    );
  }
  const definition = tools.find((item) => item.name === tool);
  const properties = record(definition?.inputSchema.properties);
  const schema = record(properties.model);
  const ratio = record(properties.aspect_ratio);
  const ids = Array.isArray(schema.enum)
    ? schema.enum.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (!ids.length)
    throw new ConsoleError('Maker MCP 未提供此图片操作的模型枚举，暂不能提交。', 503);
  return {
    provider: { source: 'maker', identity: canvasImageProviderIdentity(configured) },
    tool,
    origin: 'mcp',
    label: 'Maker MCP · ' + tool,
    ...(properties.aspect_ratio
      ? {
          aspectRatio: {
            required: definition?.inputSchema.required?.includes('aspect_ratio') === true,
            ...(Array.isArray(ratio.enum)
              ? { values: ratio.enum.filter((value): value is string => typeof value === 'string') }
              : {}),
          },
        }
      : {}),
    ...(typeof schema.description === 'string' ? { description: schema.description } : {}),
    ...(typeof schema.default === 'string' && ids.includes(schema.default)
      ? { defaultModel: schema.default }
      : {}),
    models: ids.map((id) => ({
      id,
      label: id,
      // Upstream Image3 currently documents a three-image total, including the edit source.
      // This limit is prose-only metadata; do not parse model branding/descriptions as a protocol.
      maxReferenceImages: id === 'image3' ? 3 : 14,
    })),
  };
}
