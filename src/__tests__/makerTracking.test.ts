import {
  buildMakerMcpTrackingPayload,
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
      },
    });
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
});
