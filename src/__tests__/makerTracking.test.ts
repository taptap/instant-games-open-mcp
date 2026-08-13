import fs from 'node:fs';
import path from 'node:path';
import {
  buildMakerMcpTrackingPayload,
  isMakerBuildActivitySuccessful,
  reportMakerMcpActivity,
  sanitizeMakerMcpTrackingError,
} from '../maker/tracking';

describe('maker MCP tracking', () => {
  test('builds a local MCP event with the configured identity and source', () => {
    expect(
      buildMakerMcpTrackingPayload({
        context: { userId: 'user-1', projectId: 'project-1' },
        toolName: 'maker_status_lite',
        requestId: 7,
        success: true,
        durationMs: 12.6,
        userAgent: '@taptap/maker@0.0.25',
      })
    ).toEqual({
      action: 'tapmaker_mcp_call',
      user_agent: '@taptap/maker@0.0.25',
      args: {
        user_id: 'user-1',
        project_id: 'project-1',
        tool_name: 'maker_status_lite',
        source: 'local_mcp',
        mcp_version: 'dev',
        tool_id: '7',
        duration_ms: 13,
        success: true,
      },
    });
  });

  test('does not build an event when identity or tool name is missing', () => {
    expect(
      buildMakerMcpTrackingPayload({
        context: { userId: '', projectId: 'project-1' },
        toolName: 'maker_status_lite',
      })
    ).toBeNull();
    expect(
      buildMakerMcpTrackingPayload({
        context: { userId: 'user-1', projectId: 'project-1' },
        toolName: ' ',
      })
    ).toBeNull();
  });

  test('omits unavailable optional request and duration values', () => {
    expect(
      buildMakerMcpTrackingPayload({
        context: { userId: 'user-1', projectId: 'project-1' },
        toolName: 'maker://status',
        requestId: '',
        durationMs: -1,
      })
    ).toEqual({
      action: 'tapmaker_mcp_call',
      args: {
        user_id: 'user-1',
        project_id: 'project-1',
        tool_name: 'maker://status',
        source: 'local_mcp',
        mcp_version: 'dev',
      },
    });
  });

  test('marks only a completed remote build as successful activity', () => {
    expect(isMakerBuildActivitySuccessful('remote_build')).toBe(true);
    expect(isMakerBuildActivitySuccessful('remote_build_failed')).toBe(false);
    expect(isMakerBuildActivitySuccessful('submit_failed_before_build')).toBe(false);
    expect(isMakerBuildActivitySuccessful('settings_invalid_before_build')).toBe(false);
    expect(isMakerBuildActivitySuccessful('build_failed_after_submit')).toBe(false);
  });

  test('uses dev instead of the root package version for local Maker bundles', () => {
    const bundleScript = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/bundle-maker.js'),
      'utf8'
    );

    expect(bundleScript).toContain("const VERSION = process.env.MAKER_PACKAGE_VERSION || 'dev';");
    expect(bundleScript).not.toContain('process.env.MAKER_PACKAGE_VERSION || packageJson.version');
  });

  test('redacts credentials from error messages without hiding paths or identifiers', () => {
    expect(
      sanitizeMakerMcpTrackingError(
        'PAT=secret-value failed at /Users/test/game for user_id=user-1 project_id=project-1'
      )
    ).toBe('PAT=<redacted> failed at /Users/test/game for user_id=user-1 project_id=project-1');
    expect(sanitizeMakerMcpTrackingError('Authorization: Bearer secret-value')).toBe(
      'Authorization: <redacted>'
    );
    expect(sanitizeMakerMcpTrackingError('Authorization: Bearer abc%2Ftoken failed')).toBe(
      'Authorization: <redacted> failed'
    );
    expect(sanitizeMakerMcpTrackingError('Invalid MAC key: secret-value')).toBe(
      'Invalid MAC key: <redacted>'
    );
    expect(
      sanitizeMakerMcpTrackingError('Git failed for https://secret-value@example.com/repo')
    ).toBe('Git failed for https://<redacted>@example.com/repo');
  });

  test('does not mistake ordinary diagnostic keys for PAT credentials', () => {
    expect(sanitizeMakerMcpTrackingError('compat=v1.0')).toBe('compat=v1.0');
  });

  test('posts the event and isolates a failed tracking request', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

    await expect(
      reportMakerMcpActivity({
        context: { userId: 'user-1', projectId: 'project-1' },
        toolName: 'maker_status_lite',
        fetchImpl,
      })
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://maker.taptap.cn/api/v1/tracking');
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      action: 'tapmaker_mcp_call',
      args: {
        user_id: 'user-1',
        project_id: 'project-1',
        tool_name: 'maker_status_lite',
        source: 'local_mcp',
        mcp_version: 'dev',
      },
    });

    const failingFetch = jest.fn<typeof fetch>(async () => {
      throw new Error('network down');
    });
    await expect(
      reportMakerMcpActivity({
        context: { userId: 'user-1', projectId: 'project-1' },
        toolName: 'maker_status_lite',
        fetchImpl: failingFetch,
      })
    ).resolves.toBeUndefined();
  });

  test('releases response bodies before isolating tracking failures', async () => {
    const response = new Response('temporary failure', { status: 502 });
    const fetchImpl = jest.fn<typeof fetch>(async () => response);

    await expect(
      reportMakerMcpActivity({
        context: { userId: 'user-1', projectId: 'project-1' },
        toolName: 'maker_status_lite',
        fetchImpl,
      })
    ).resolves.toBeUndefined();

    expect(response.bodyUsed).toBe(true);
  });
});
