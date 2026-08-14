import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import baseline from './fixtures/maker-tool-descriptions-baseline.json';
import proxySnapshot from '../maker/server/remoteProxyToolSnapshot.json';
import { MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES } from '../maker/server/mcp';
import { getMakerRemoteProxyPublicDescriptionOverride } from '../maker/server/toolDescriptions';
import { listMakerTools } from '../maker/server/mcp';
import { saveProjectConfig } from '../maker/storage';

describe('Maker tool description override coverage', () => {
  test('runtime proxy snapshot contains the complete reviewed public surface', () => {
    const expectedRemoteTools = baseline.tools
      .filter((tool) => tool.source === 'remote-proxy')
      .map((tool) => tool.name);

    expect(proxySnapshot.schemaVersion).toBe(1);
    expect(proxySnapshot.toolOrder).toEqual(expectedRemoteTools);
    expect(proxySnapshot.toolOrder).toEqual(MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES);
    expect(proxySnapshot.tools.map((tool) => tool.name)).toEqual(expectedRemoteTools);
    expect(new Set(proxySnapshot.tools.map((tool) => tool.name)).size).toBe(
      proxySnapshot.tools.length
    );
    expect(proxySnapshot.tools).toHaveLength(MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES.length);

    for (const tool of proxySnapshot.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description).toBe(getMakerRemoteProxyPublicDescriptionOverride(tool.name));
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
      expect(tool.inputSchema.properties).toHaveProperty('target_dir');
      expect(tool.inputSchema.properties.target_dir.description).toContain('MCP Roots');
      expect(tool.inputSchema.properties.target_dir.description).toContain(
        'process cwd only as the final fallback'
      );
      expect(tool.inputSchema.properties.target_dir.description).toContain(
        'not persisted in user-level MCP config'
      );
    }
  });

  test('every exposed remote proxy tool has a reviewed public description', () => {
    const missingDescriptions = MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES.filter(
      (toolName) => !getMakerRemoteProxyPublicDescriptionOverride(toolName)?.trim()
    );

    expect(missingDescriptions).toEqual([]);
  });

  test('captures the current remote image, 3D, and video schema contract', () => {
    const toolSchema = (name: string) =>
      proxySnapshot.tools.find((tool) => tool.name === name)?.inputSchema;

    expect(toolSchema('generate_image')?.properties).toHaveProperty('quality');
    expect(toolSchema('batch_generate_images')?.properties.images.items.properties).toHaveProperty(
      'quality'
    );
    expect(toolSchema('edit_image')?.properties).toHaveProperty('quality');
    expect(toolSchema('create_3d_asset')?.properties.payload.properties).toHaveProperty(
      'subject_type'
    );
    expect(toolSchema('create_video_task')?.properties.model.enum).toEqual(['2.0', '2.5']);
    expect(toolSchema('create_video_task')?.properties.resolution.enum).toEqual(['480p', '720p']);
    expect(toolSchema('create_video_task')?.properties).not.toHaveProperty('seed');
  });

  test('unknown future tools keep the upstream description fallback', () => {
    expect(getMakerRemoteProxyPublicDescriptionOverride('future_remote_tool')).toBeUndefined();
  });

  test('keeps the reviewed static schemas authoritative over supplied remote definitions', async () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-tool-baseline-'));
    saveProjectConfig(targetDir, {
      project_id: 'tool-baseline-project',
      user_id: 'tool-baseline-user',
    });

    try {
      const remoteTools = baseline.tools
        .filter((tool) => tool.source === 'remote-proxy')
        .map((tool) => ({
          name: tool.name,
          description: tool.remoteComponents?.baseDescription || tool.description,
          inputSchema: tool.inputSchema,
        }));
      const result = await listMakerTools({
        targetDir,
        listRemoteTools: async () => remoteTools,
      });

      expect(result.tools.map((tool) => tool.name)).toEqual(baseline.toolOrder);
      expect(JSON.stringify(result.tools)).not.toMatch(
        /prefer(?: this)? Maker MCP proxy tools?|over native AI|client-native|Other client media tools/iu
      );
      for (const snapshotTool of proxySnapshot.tools) {
        expect(
          stripSchemaDescriptions(
            result.tools.find((tool) => tool.name === snapshotTool.name)?.inputSchema
          )
        ).toEqual(stripSchemaDescriptions(snapshotTool.inputSchema));
      }
    } finally {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

function stripSchemaDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSchemaDescriptions);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'description')
        .map(([key, nested]) => [key, stripSchemaDescriptions(nested)])
    );
  }
  return value;
}
