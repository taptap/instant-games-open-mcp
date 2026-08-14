import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  buildRemoteProxyToolSnapshot,
  findRemoteProxyToolSchemaDrift,
} from '../maker/server/remoteProxyToolContract.js';

const REMOTE_TOOL: Tool = {
  name: 'generate_image',
  description: 'remote description',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      quality: { type: 'string', enum: ['low', 'high'] },
    },
    required: ['prompt'],
  },
};

describe('Maker remote proxy tool snapshot', () => {
  test('builds a reviewed local definition while preserving the remote input schema', () => {
    const snapshot = buildRemoteProxyToolSnapshot({
      remoteTools: [REMOTE_TOOL],
      exposedToolNames: ['generate_image'],
      getPublicDescription: () => 'reviewed description',
    });

    expect(snapshot.tools).toEqual([
      {
        name: 'generate_image',
        description: 'reviewed description',
        inputSchema: {
          ...REMOTE_TOOL.inputSchema,
          properties: {
            ...REMOTE_TOOL.inputSchema.properties,
            target_dir: expect.objectContaining({ type: 'string' }),
          },
        },
      },
    ]);

    const targetDir = snapshot.tools[0].inputSchema.properties?.target_dir as Record<
      string,
      unknown
    >;
    expect(targetDir.description).toContain('MCP Roots');
    expect(targetDir.description).toContain('process cwd only as the final fallback');
    expect(targetDir.description).toContain('not persisted in user-level MCP config');
  });

  test('reports missing and obsolete remote schema fields but ignores local-only fields', () => {
    const drift = findRemoteProxyToolSchemaDrift({
      remoteTools: [REMOTE_TOOL],
      snapshot: {
        schemaVersion: 1,
        toolOrder: ['generate_image'],
        tools: [
          {
            name: 'generate_image',
            description: 'reviewed description',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { type: 'string' },
                seed: { type: 'integer' },
                target_dir: { type: 'string' },
              },
              required: ['prompt'],
            },
          },
        ],
      },
    });

    expect(drift.map((item) => item.path)).toEqual([
      'generate_image.inputSchema.properties.quality',
      'generate_image.inputSchema.properties.seed',
    ]);
  });

  test('reports exposed whitelist entries missing from the checked-in snapshot', () => {
    const editTool: Tool = {
      name: 'edit_image',
      description: 'remote edit description',
      inputSchema: { type: 'object', properties: {} },
    };
    const snapshot = buildRemoteProxyToolSnapshot({
      remoteTools: [REMOTE_TOOL],
      exposedToolNames: ['generate_image'],
      getPublicDescription: () => 'reviewed description',
    });

    const drift = findRemoteProxyToolSchemaDrift({
      remoteTools: [REMOTE_TOOL, editTool],
      exposedToolNames: ['generate_image', 'edit_image'],
      snapshot,
    });

    expect(drift.map((item) => item.path)).toEqual(['toolOrder', 'edit_image.snapshot']);
  });

  test('reports remote parameter-description drift because descriptions carry call semantics', () => {
    const remoteTool: Tool = {
      ...REMOTE_TOOL,
      inputSchema: {
        ...REMOTE_TOOL.inputSchema,
        properties: {
          ...REMOTE_TOOL.inputSchema.properties,
          prompt: { type: 'string', description: 'current remote prompt contract' },
        },
      },
    };
    const snapshot = buildRemoteProxyToolSnapshot({
      remoteTools: [remoteTool],
      exposedToolNames: ['generate_image'],
      getPublicDescription: () => 'reviewed description',
    });
    const promptSchema = snapshot.tools[0].inputSchema.properties?.prompt as Record<
      string,
      unknown
    >;
    promptSchema.description = 'stale prompt contract';

    const drift = findRemoteProxyToolSchemaDrift({
      remoteTools: [remoteTool],
      snapshot,
    });

    expect(drift.map((item) => item.path)).toEqual([
      'generate_image.inputSchema.properties.prompt.description',
    ]);
  });
});
