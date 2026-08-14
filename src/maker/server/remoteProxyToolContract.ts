import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type RemoteProxyToolSnapshot = {
  schemaVersion: 1;
  toolOrder: string[];
  tools: Tool[];
};

export type RemoteProxyToolSchemaDrift = {
  path: string;
  remoteValue: unknown;
  snapshotValue: unknown;
};

const TARGET_DIR_SCHEMA = {
  type: 'string',
  description:
    'Optional local Maker project directory. When omitted, Maker MCP uses one unambiguous MCP Roots workspace and process cwd only as the final fallback. Pass it explicitly when Roots are unavailable or ambiguous, or when the fallback is not the intended project. This local-only value is not persisted in user-level MCP config and is not forwarded to the remote Maker tool.',
};

const CONFIRMED_SCREEN_ORIENTATION_SCHEMA = {
  type: 'string',
  enum: ['landscape', 'portrait'],
  description:
    'Local-only first-time orientation choice. Omit this when the project already has screen_orientation. Supply it only after the tool reports that orientation is missing and the user selects a value in a separate conversation turn. Existing project orientation is immutable and takes precedence. This value is not forwarded to the remote Maker tool.',
};

/** Build the versioned public tool artifact from one live remote tools/list response. */
export function buildRemoteProxyToolSnapshot(options: {
  remoteTools: Tool[];
  exposedToolNames: string[];
  getPublicDescription: (toolName: string) => string | undefined;
}): RemoteProxyToolSnapshot {
  const remoteByName = new Map(options.remoteTools.map((tool) => [tool.name, tool]));
  const tools = options.exposedToolNames.map((toolName) => {
    const remoteTool = remoteByName.get(toolName);
    if (!remoteTool) {
      throw new Error(`Remote Maker proxy tools/list is missing exposed tool: ${toolName}`);
    }
    const description = options.getPublicDescription(toolName)?.trim();
    if (!description) {
      throw new Error(`Missing reviewed public description for Maker proxy tool: ${toolName}`);
    }
    const inputSchema = cloneJson(remoteTool.inputSchema) as Tool['inputSchema'];
    const properties = isRecord(inputSchema.properties) ? inputSchema.properties : {};
    inputSchema.properties = {
      ...properties,
      ...(toolName === 'generate_test_qrcode'
        ? { confirmed_screen_orientation: CONFIRMED_SCREEN_ORIENTATION_SCHEMA }
        : {}),
      target_dir: TARGET_DIR_SCHEMA,
    };
    return {
      name: toolName,
      description,
      inputSchema,
    };
  });

  return {
    schemaVersion: 1,
    toolOrder: [...options.exposedToolNames],
    tools,
  };
}

/** Compare the checked-in public artifact with current remote input schemas. */
export function findRemoteProxyToolSchemaDrift(options: {
  remoteTools: Tool[];
  exposedToolNames?: string[];
  snapshot: RemoteProxyToolSnapshot;
}): RemoteProxyToolSchemaDrift[] {
  const remoteByName = new Map(options.remoteTools.map((tool) => [tool.name, tool]));
  const snapshotByName = new Map(options.snapshot.tools.map((tool) => [tool.name, tool]));
  const exposedToolNames = options.exposedToolNames ?? options.snapshot.toolOrder;
  const drift: RemoteProxyToolSchemaDrift[] = [];

  if (JSON.stringify(options.snapshot.toolOrder) !== JSON.stringify(exposedToolNames)) {
    drift.push({
      path: 'toolOrder',
      remoteValue: exposedToolNames,
      snapshotValue: options.snapshot.toolOrder,
    });
  }

  for (const toolName of exposedToolNames) {
    const remoteTool = remoteByName.get(toolName);
    if (!remoteTool) {
      drift.push({
        path: `${toolName}.remote`,
        remoteValue: '<missing>',
        snapshotValue: '<present>',
      });
      continue;
    }
    const snapshotTool = snapshotByName.get(toolName);
    if (!snapshotTool) {
      drift.push({
        path: `${toolName}.snapshot`,
        remoteValue: '<present>',
        snapshotValue: '<missing>',
      });
      continue;
    }
    const snapshotSchema = cloneJson(snapshotTool.inputSchema) as Tool['inputSchema'];
    if (isRecord(snapshotSchema.properties)) {
      delete snapshotSchema.properties.target_dir;
      delete snapshotSchema.properties.confirmed_screen_orientation;
    }
    collectSchemaDrift(
      remoteTool.inputSchema,
      snapshotSchema,
      `${snapshotTool.name}.inputSchema`,
      drift
    );
  }

  return drift;
}

function collectSchemaDrift(
  remoteValue: unknown,
  snapshotValue: unknown,
  path: string,
  drift: RemoteProxyToolSchemaDrift[]
): void {
  if (Array.isArray(remoteValue) || Array.isArray(snapshotValue)) {
    if (JSON.stringify(remoteValue) !== JSON.stringify(snapshotValue)) {
      drift.push({ path, remoteValue, snapshotValue });
    }
    return;
  }
  if (isRecord(remoteValue) && isRecord(snapshotValue)) {
    const keys = new Set([...Object.keys(remoteValue), ...Object.keys(snapshotValue)]);
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(remoteValue, key)) {
        drift.push({
          path: `${path}.${key}`,
          remoteValue: '<missing>',
          snapshotValue: snapshotValue[key],
        });
      } else if (!Object.prototype.hasOwnProperty.call(snapshotValue, key)) {
        drift.push({
          path: `${path}.${key}`,
          remoteValue: remoteValue[key],
          snapshotValue: '<missing>',
        });
      } else {
        collectSchemaDrift(remoteValue[key], snapshotValue[key], `${path}.${key}`, drift);
      }
    }
    return;
  }
  if (remoteValue !== snapshotValue) {
    drift.push({ path, remoteValue, snapshotValue });
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
