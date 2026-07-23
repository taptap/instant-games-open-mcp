import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import baseline from './fixtures/maker-tool-descriptions-baseline.json';
import { MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES } from '../maker/server/mcp';
import { getMakerRemoteProxyPublicDescriptionOverride } from '../maker/server/toolDescriptions';
import { listMakerTools } from '../maker/server/mcp';
import { saveProjectConfig } from '../maker/storage';

describe('Maker tool description override coverage', () => {
  test('every exposed remote proxy tool has a reviewed public description', () => {
    const missingDescriptions = MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES.filter(
      (toolName) => !getMakerRemoteProxyPublicDescriptionOverride(toolName)?.trim()
    );

    expect(missingDescriptions).toEqual([]);
  });

  test('unknown future tools keep the upstream description fallback', () => {
    expect(getMakerRemoteProxyPublicDescriptionOverride('future_remote_tool')).toBeUndefined();
  });

  test('keeps the reviewed public tool order and input schemas aligned with the baseline', async () => {
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
      for (const snapshotTool of baseline.tools.filter((tool) => tool.source === 'remote-proxy')) {
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
