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

  test('actual tools list disables automatic retry for every remote proxy tool', async () => {
    const result = await listMakerTools();

    for (const toolName of MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES) {
      const description = result.tools.find((tool) => tool.name === toolName)?.description || '';
      expect(description).toMatch(/not retried automatically/iu);
      expect(description).toMatch(/execution state may be unknown/iu);
      expect(description).toMatch(/verify.{0,100}before deciding whether to retry/iu);
    }
  });

  test('captures the current remote image, 3D, video, and achievement schema contract', () => {
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
    expect(toolSchema('achievement')?.required).toEqual(['op']);
    expect(toolSchema('achievement')?.properties.op.enum).toEqual([
      'sync_achievements',
      'get_achievement',
      'create_achievement',
      'update_achievement',
      'delete_achievement',
      'set_achievement_order',
      'check_publish_achievements',
      'publish_achievements',
      'get_platinum_achievement',
      'create_platinum_achievement',
      'update_platinum_achievement',
      'delete_platinum_achievement',
      'check_publish_platinum_achievement',
      'publish_platinum_achievement',
      'cancel_platinum_achievement_audit',
      'add_achievement_test_users',
      'reset_achievement',
      'list_achievement_test_users',
      'reset_achievement_test_user',
    ]);
    expect(toolSchema('achievement')?.properties).toHaveProperty('achievement_id');
    expect(toolSchema('achievement')?.properties).toHaveProperty('image_url');
    expect(toolSchema('achievement')?.properties).toHaveProperty('user_ids');
    expect(toolSchema('achievement')?.properties).not.toHaveProperty('app_id');
    expect(toolSchema('achievement')?.properties).not.toHaveProperty('developer_id');
    expect(toolSchema('achievement')?.properties).not.toHaveProperty('client_id');
    expect(toolSchema('achievement')?.properties).not.toHaveProperty('managementId');
  });

  test('unknown future tools keep the upstream description fallback', () => {
    expect(getMakerRemoteProxyPublicDescriptionOverride('future_remote_tool')).toBeUndefined();
  });

  test('covers achievement Agent conversation branches in the public description and skill', () => {
    const description = getMakerRemoteProxyPublicDescriptionOverride('achievement') || '';
    const skill = fs.readFileSync(path.resolve('skills/taptap-maker-local/SKILL.md'), 'utf8');
    const guide = fs.readFileSync(path.resolve('docs/MAKER_ACHIEVEMENTS.md'), 'utf8');

    for (const text of [description, skill, guide]) {
      expect(text).toMatch(/query-only|只查询/iu);
      expect(text).toMatch(/not a read-only query|is not read-only|不是纯只读|不是只读查询/iu);
      expect(text).toMatch(
        /missing local taptap_publish|本地缺少 `taptap_publish`|missing local `taptap_publish`/iu
      );
      expect(text).toMatch(/developer-center URL|开发者中心/iu);
      expect(text).toMatch(/whole app|整个应用|作用于整个应用/iu);
      expect(text).toMatch(/lock_sync\.synced=false/iu);
      expect(text).toMatch(/HTTP\(S\)/iu);
      expect(text).toMatch(/user_ids|测试账户|test user/iu);
      expect(text).toMatch(/platinum|白金/iu);
    }

    expect(description).toMatch(/do not file an MCP issue report/iu);
    expect(skill).toContain('Maker Achievement Workflow');
    expect(skill).toContain('Do not apply that local-identity gate to `achievement`');
    expect(guide).toContain('只查询且无写入授权');
    expect(guide).toContain('白金（仅用户明确要求时）');
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
