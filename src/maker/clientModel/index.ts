import { identifyLocalClient, resolveLocalSessionModel } from './localSession.js';
import type { MakerClientModel, MakerClientModelContext } from './types.js';
import { bestEffort } from '../system/bestEffort.js';
import { CLIENT_MODEL_TIMEOUT_MS } from './limits.js';

export type { MakerClientModel, MakerClientModelContext } from './types.js';

export const MAKER_CLIENT_MODEL_ARGUMENT = '_maker_client_model';
export const MAKER_CLIENT_MODEL_META_KEY = 'cn.taptap.maker/client-model';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function reportedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 256 ||
    /^(unknown|unavailable|n\/a|null|undefined)$/i.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

/** Extract only model fields; remove the private argument before any business dispatch. */
export function extractMakerClientModelRequest(
  args: unknown,
  meta?: unknown
): {
  arguments: Record<string, unknown>;
  model?: MakerClientModel;
} {
  const { [MAKER_CLIENT_MODEL_ARGUMENT]: reported, ...businessArgs } = asRecord(args) ?? {};
  const metadata = asRecord(asRecord(meta)?.[MAKER_CLIENT_MODEL_META_KEY]);
  const id = reportedString(metadata?.client_model_id);
  const resolved = reportedString(metadata?.resolved_model);
  if (id || resolved) {
    return {
      arguments: businessArgs,
      model: {
        ...(id ? { client_model_id: id } : {}),
        ...(resolved ? { resolved_model: resolved } : {}),
        client_model_name: reportedString(metadata?.client_model_name),
        model_provider: reportedString(metadata?.model_provider),
        model_lookup_scope: 'current_call',
        model_lookup_source: 'request_metadata',
      },
    };
  }
  const reportedId = reportedString(reported);
  if (!reportedId) return { arguments: businessArgs };
  return {
    arguments: businessArgs,
    model: {
      client_model_id: reportedId,
      model_lookup_scope: 'current_call',
      model_lookup_source: 'tool_argument',
    },
  };
}

/** Prefer this call's supplied model; only missing values invoke IDE-specific local lookup. */
export async function resolveMakerClientModel(
  context: MakerClientModelContext = {}
): Promise<MakerClientModel> {
  if (context.requestModel?.client_model_id || context.requestModel?.resolved_model) {
    return { ...context.requestModel };
  }
  const local = await resolveLocalSessionModel(context);
  return Object.keys(local).length ? { ...local, model_lookup_source: 'local_session' } : {};
}

/** One resolver per MCP connection: retain IDE identity, never a model from another call. */
export function createMakerClientModelResolver() {
  let identity: ReturnType<typeof identifyLocalClient> | undefined;
  let client: Awaited<ReturnType<typeof identifyLocalClient>> | undefined;
  return (context: MakerClientModelContext = {}): Promise<MakerClientModel> =>
    bestEffort(
      async () => {
        identity ??= identifyLocalClient(context.clientName);
        client = await identity;
        const resolved = await resolveMakerClientModel({
          ...context,
          clientProcesses: client.clientProcesses,
        });
        // Legacy latest-session parsers are not evidence of the dialogue invoking this MCP.
        const model = resolved.model_lookup_scope === 'latest_session' ? {} : resolved;
        return { ...model, client_ide_name: client.clientIdeName ?? model.client_ide_name };
      },
      CLIENT_MODEL_TIMEOUT_MS,
      { client_ide_name: client?.clientIdeName ?? reportedString(context.clientName) }
    );
}
