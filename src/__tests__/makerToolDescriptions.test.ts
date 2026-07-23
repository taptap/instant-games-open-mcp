import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listMakerTools, tools } from '../maker/server/mcp';
import { saveProjectConfig } from '../maker/storage';

const REMOTE_TOOL_NAMES = [
  'generate_image',
  'batch_generate_images',
  'edit_image',
  'create_video_task',
  'query_video_task',
  'create_3d_asset',
  'generate_test_qrcode',
  'add_test_whitelist',
  'get_ad_config',
  'get_debug_feedbacks',
] as const;

describe('Maker non-audio tool descriptions', () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-tool-descriptions-'));
    saveProjectConfig(targetDir, {
      project_id: 'tool-description-project',
      user_id: 'tool-description-user',
    });
  });

  afterEach(() => fs.rmSync(targetDir, { recursive: true, force: true }));

  test('keeps local status and build descriptions focused on public behavior', () => {
    const statusDescription =
      tools.find((tool) => tool.name === 'maker_status_lite')?.description || '';
    const buildDescription =
      tools.find((tool) => tool.name === 'maker_build_current_directory')?.description || '';

    expect(statusDescription).toMatch(/compatibility.{0,100}maker:\/\/status/iu);
    expect(statusDescription).toMatch(/starting or resuming.{0,100}Maker/iu);
    expect(statusDescription).toMatch(/skip_remote_sync.{0,160}not.{0,80}offline/iu);
    expect(statusDescription).toMatch(/next_action.{0,40}next_step/iu);
    expect(statusDescription).not.toContain('including Git, Python runtime readiness');
    expect(statusDescription).not.toContain('Standard init/clone/download flow');

    expect(buildDescription).toMatch(/bound Maker project.{0,120}status/iu);
    expect(buildDescription).toMatch(/build.{0,40}preview.{0,40}submit.{0,40}push/iu);
    expect(buildDescription).toMatch(/tests?.{0,40}lint.{0,100}do not trigger/iu);
    expect(buildDescription).toMatch(/commits?.{0,80}pushes?.{0,100}remote build/iu);
    expect(buildDescription).toMatch(/confirm_remote_build_without_submit=true/iu);
    expect(buildDescription).not.toContain('Python environment section');
    expect(buildDescription).not.toContain('Lua LSP environment section');
    expect(buildDescription).toContain('runtime_logs.local_file');
  });

  test('replaces remote manuals without changing upstream schemas', async () => {
    const result = await listMakerTools({
      targetDir,
      listRemoteTools: async () =>
        REMOTE_TOOL_NAMES.map((name) => ({
          name,
          description: [
            `REMOTE MANUAL FOR ${name}`,
            'Examples:',
            'Parameters:',
            '返回格式： { "internal": true }',
            'If this Maker proxy tool fails or returns isError, include remote_result.',
          ].join('\n'),
          inputSchema: {
            type: 'object',
            properties: {
              upstream_only_field: {
                type: 'string',
                description: 'Remote field preserved by local description overrides.',
              },
            },
            required: ['upstream_only_field'],
          },
        })),
    });

    for (const name of REMOTE_TOOL_NAMES) {
      const tool = result.tools.find((item) => item.name === name);
      expect(tool?.description).not.toContain('REMOTE MANUAL');
      expect(tool?.description).not.toContain('Examples:');
      expect(tool?.description).not.toContain('Parameters:');
      expect(tool?.description).not.toContain('返回格式');
      expect(tool?.description).not.toContain('include remote_result');
      expect(tool?.inputSchema.properties.upstream_only_field).toMatchObject({ type: 'string' });
      expect(tool?.inputSchema.required).toContain('upstream_only_field');
    }
  });

  test('preserves image and video routing plus local materialization contracts', async () => {
    const descriptions = await listDescriptions();

    expect(descriptions.generate_image).toMatch(
      /one new image.{0,120}batch_generate_images.{0,100}edit_image/iu
    );
    expect(descriptions.generate_image).toMatch(/reference images?.{0,220}Maker project/iu);
    expect(descriptions.generate_image).toMatch(/local paths?.{0,100}data URLs?.{0,80}10 MiB/iu);

    expect(descriptions.batch_generate_images).toMatch(/two or more.{0,80}parallel/iu);
    expect(descriptions.batch_generate_images).toMatch(/generate_image.{0,100}edit_image/iu);
    expect(descriptions.batch_generate_images).toMatch(
      /partial(?:ly)? succe\w*.{0,120}failed items/iu
    );

    expect(descriptions.edit_image).toMatch(/existing image.{0,120}generate_image/iu);
    expect(descriptions.edit_image).toMatch(
      /local Maker project path.{0,100}HTTP\(S\).{0,80}data URL/iu
    );
    expect(descriptions.edit_image).toMatch(/local-path or data URL image.{0,80}10 MiB/iu);

    expect(descriptions.create_video_task).toMatch(/server-side.{0,80}wait/iu);
    expect(descriptions.create_video_task).toMatch(
      /task_id.{0,100}query_video_task.{0,100}120 seconds/iu
    );
    expect(descriptions.create_video_task).toMatch(
      /local project files.{0,80}HTTP\(S\).{0,80}data URLs/iu
    );
    expect(descriptions.create_video_task).toMatch(
      /image references.{0,60}30 MiB.{0,80}video references.{0,60}50 MiB.{0,80}audio references.{0,60}15 MiB/iu
    );

    expect(descriptions.query_video_task).toMatch(/task_id.{0,180}120 seconds/iu);
    expect(descriptions.query_video_task).toMatch(/completed task.{0,80}releases.{0,80}quota/iu);
    expect(descriptions.query_video_task).toMatch(/attempts to materialize.{0,100}Maker project/iu);
    expect(descriptions.query_video_task).toMatch(
      /workspace_video_path.{0,100}workspace_last_frame_path.{0,120}external share/iu
    );
    expect((descriptions.query_video_task.match(/query video task status/giu) || []).length).toBe(
      1
    );
  });

  test('preserves 3D review, QR, whitelist, ad, and feedback workflows', async () => {
    const descriptions = await listDescriptions();

    expect(descriptions.create_3d_asset).toMatch(
      /action="start".{0,100}action="query".{0,100}action="get_options".{0,100}action="continue"/iu
    );
    expect(descriptions.create_3d_asset).toMatch(
      /explicit user approval.{0,120}action="continue"/iu
    );
    expect(descriptions.create_3d_asset).toMatch(/direct.{0,100}reviewed.{0,120}preview/iu);
    expect(descriptions.create_3d_asset).toMatch(/assets\/model.{0,100}local_delivery/iu);

    expect(descriptions.generate_test_qrcode).toMatch(
      /explicitly requests.{0,100}test QR code.{0,120}get_ad_config/iu
    );
    expect(descriptions.generate_test_qrcode).toMatch(
      /without confirmed_screen_orientation.{0,180}separate conversation turn/iu
    );
    expect(descriptions.generate_test_qrcode).toMatch(/upload.{0,100}create.{0,80}TapTap app/iu);
    expect(descriptions.generate_test_qrcode).not.toMatch(/run ['"]build['"] tool/iu);

    expect(descriptions.add_test_whitelist).toMatch(
      /maker_build_current_directory.{0,120}generate_test_qrcode/iu
    );
    expect(descriptions.add_test_whitelist).toMatch(/user_id.{0,100}explicitly provided/iu);
    expect(descriptions.add_test_whitelist).not.toContain('publish_game_as_tool');

    expect(descriptions.get_ad_config).toMatch(/Maker project status.{0,160}first remote step/iu);
    expect(descriptions.get_ad_config).toMatch(/\.project\/settings\.json.{0,80}@runtime\.ad/iu);
    expect(descriptions.get_ad_config).toMatch(
      /app_id.{0,80}developer_id.{0,120}generate_test_qrcode.{0,100}retry/iu
    );
    expect(descriptions.get_ad_config).toMatch(/ad\.status != 1.{0,120}warning.{0,80}ad\.url/iu);
    expect(descriptions.get_ad_config).not.toContain('synced_at');

    expect(descriptions.get_debug_feedbacks).toMatch(
      /online player feedback.{0,160}session logs.{0,80}game_session_id/iu
    );
    expect(descriptions.get_debug_feedbacks).toMatch(/marks?.{0,100}processed/iu);
    expect(descriptions.get_debug_feedbacks).toMatch(
      /read-only.{0,100}fetch_and_mark_processed=false/iu
    );
    expect(descriptions.get_debug_feedbacks).toMatch(
      /local_dir.{0,80}local_log_paths.{0,80}local_screenshot_paths/iu
    );
    expect(descriptions.get_debug_feedbacks).not.toContain('├──');
    expect(descriptions.get_debug_feedbacks).not.toContain('/opt/log/server/');
  });

  async function listDescriptions(): Promise<Record<(typeof REMOTE_TOOL_NAMES)[number], string>> {
    const result = await listMakerTools({
      targetDir,
      listRemoteTools: async () =>
        REMOTE_TOOL_NAMES.map((name) => ({
          name,
          description: 'Remote description replaced by the reviewed public contract.',
          inputSchema: { type: 'object', properties: {} },
        })),
    });
    return Object.fromEntries(
      REMOTE_TOOL_NAMES.map((name) => [
        name,
        result.tools.find((item) => item.name === name)?.description || '',
      ])
    ) as Record<(typeof REMOTE_TOOL_NAMES)[number], string>;
  }
});
