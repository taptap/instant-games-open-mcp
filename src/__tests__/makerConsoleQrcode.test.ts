import { executeQrcodeCommand } from '../maker/cli/qrcode.js';

jest.mock('../maker/preview/protocol.js', () => ({
  previewProject: (directory: string) => directory,
}));

describe('console test QR command', () => {
  it.each(['throw', 'result'])(
    'keeps known developer failure outcome unknown (%s), without retry',
    async (mode) => {
      const deps = dependencies();
      const error =
        '生成测试二维码失败: 检测到多个可用的开发者身份，需要用户选择：\n\n' +
        '  1. [个人] [未认证] A (ID: 123) ⭐ 推荐\n\n请按以下步骤操作：';
      if (mode === 'throw') deps.call.mockRejectedValue(new Error(error));
      else
        deps.call.mockResolvedValue({
          isError: true,
          content: [{ type: 'text', text: error }],
        } as never);
      expect(await executeQrcodeCommand('/project/a', undefined, deps)).toMatchObject({
        ok: false,
        unknown: true,
        interaction: { kind: 'select_developer', options: [{ value: 123 }] },
      });
      expect(deps.call).toHaveBeenCalledTimes(1);
      expect(deps.submit).not.toHaveBeenCalled();
    }
  );
  const dependencies = () => ({
    access: jest.fn(async () => ({ blocked: false })),
    preflight: jest.fn(() => ({ ok: true as const, orientation: 'landscape' as const })),
    call: jest.fn(async () => ({ content: [{ type: 'text' as const, text: 'QR ready' }] })),
    prepare: jest.fn(() => ({ ok: true as const, orientation: 'portrait' as const })),
    readiness: jest.fn(() => ({ status: 'ready' as const })),
    submit: jest.fn(async () => ({
      branch: 'main',
      committed: true,
      pushed: true,
      status: 'pushed' as const,
    })),
  });

  it.each(['needs_initialization', 'blocked'])(
    'stops before saving or submitting when preparation is %s',
    async (status) => {
      const deps = dependencies();
      deps.readiness.mockReturnValue({
        status,
        message: '先初始化或修复配置',
        action: 'build',
      } as never);
      expect(
        await executeQrcodeCommand('/project/a', 'portrait', deps, {
          confirmedBuild: true,
          publication: { title: 'Game', category: 'puzzle' },
        })
      ).toMatchObject({ ok: false, preparation: { status } });
      expect(deps.prepare).not.toHaveBeenCalled();
      expect(deps.submit).not.toHaveBeenCalled();
      expect(deps.call).not.toHaveBeenCalled();
    }
  );

  it('uses the explicitly selected project and never forwards the local orientation', async () => {
    const deps = dependencies();
    expect(
      await executeQrcodeCommand('/project/a', 'portrait', deps, { confirmedBuild: true })
    ).toMatchObject({ ok: true });
    expect(deps.preflight).toHaveBeenCalledWith('/project/a', 'portrait');
    expect(deps.call).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDir: '/project/a',
        name: 'generate_test_qrcode',
        args: {},
      })
    );
    expect(deps.call).toHaveBeenCalledTimes(1);
  });

  it('persists explicit choices then submits without an extra build before calling the remote QR tool', async () => {
    const deps = dependencies();
    const publication = { title: '拼豆', category: 'puzzle', developer_id: 123 };
    expect(
      await executeQrcodeCommand('/project/a', 'portrait', deps, {
        publication,
        confirmedBuild: true,
      })
    ).toMatchObject({ ok: true });
    expect(deps.prepare).toHaveBeenCalledWith('/project/a', 'portrait', publication);
    expect(deps.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/project/a',
        preserveQrcodeChoices: true,
      })
    );
    expect(deps.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      deps.submit.mock.invocationCallOrder[0]
    );
    expect(deps.preflight.mock.invocationCallOrder[0]).toBeLessThan(
      deps.submit.mock.invocationCallOrder[0]
    );
    expect(deps.preflight.mock.invocationCallOrder[0]).toBeLessThan(
      deps.call.mock.invocationCallOrder[0]
    );
  });

  it('never saves or syncs publication choices without explicit consent', async () => {
    const deps = dependencies();
    expect(
      await executeQrcodeCommand('/project/a', undefined, deps, {
        publication: { title: 'Game', category: 'puzzle' },
      })
    ).toMatchObject({ ok: false });
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.submit).not.toHaveBeenCalled();
    expect(deps.call).not.toHaveBeenCalled();
  });

  it('stops QR dispatch on failed submission without retry', async () => {
    const deps = dependencies();
    deps.submit.mockResolvedValue({
      branch: 'main',
      committed: true,
      pushed: false,
      status: 'failed_after_commit',
      failure: {
        message: 'Push disconnected',
        nextAction: 'Check remote state',
        classification: 'remote_transient',
      },
    } as never);
    expect(
      await executeQrcodeCommand('/project/a', undefined, deps, {
        confirmedBuild: true,
      })
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('Push disconnected'),
      requiresSync: true,
    });
    expect(deps.submit).toHaveBeenCalledTimes(1);
    expect(deps.call).not.toHaveBeenCalled();
  });

  it('preserves pending sync and never submits when local preflight fails', async () => {
    const deps = dependencies();
    deps.preflight.mockReturnValue({ ok: false, message: 'Config still missing' } as never);
    expect(
      await executeQrcodeCommand('/project/a', undefined, deps, {
        confirmedBuild: true,
      })
    ).toMatchObject({ ok: false, requiresSync: true });
    expect(deps.submit).not.toHaveBeenCalled();
    expect(deps.call).not.toHaveBeenCalled();
  });

  it('does not build or dispatch when the project config cannot be prepared', async () => {
    const deps = dependencies();
    deps.prepare.mockReturnValue({
      ok: false,
      message: 'Restore or initialize .project/project.json',
    } as never);
    expect(
      await executeQrcodeCommand('/project/a', 'portrait', deps, {
        confirmedBuild: true,
        publication: { title: 'Game', category: 'puzzle' },
      })
    ).toMatchObject({
      ok: false,
      requiresSync: true,
      error: expect.stringContaining('initialize'),
    });
    expect(deps.submit).not.toHaveBeenCalled();
    expect(deps.call).not.toHaveBeenCalled();
  });

  it('does not dispatch when project prerequisites are missing', async () => {
    const deps = dependencies();
    deps.preflight.mockReturnValue({ ok: false, message: 'Missing publishing config' } as never);
    expect(await executeQrcodeCommand('/project/a', undefined, deps)).toMatchObject({
      ok: false,
      error: 'Missing publishing config',
    });
    expect(deps.call).not.toHaveBeenCalled();
  });

  it.each(['throw', 'result'])(
    'returns unavailable-developer recovery without clearing ID or retrying: %s',
    async (mode) => {
      const deps = dependencies();
      const error =
        '生成测试二维码失败: 配置的开发者 ID 290607 不可用。\n\n请重新运行发布命令，系统会列出当前可用的开发者。';
      if (mode === 'throw') deps.call.mockRejectedValue(new Error(error));
      else
        deps.call.mockResolvedValue({
          isError: true,
          content: [{ type: 'text', text: error }],
        } as never);
      const result = await executeQrcodeCommand('/project/a', undefined, deps);
      expect(result).toMatchObject({
        ok: false,
        unknown: true,
        requiresSync: false,
        recovery: { kind: 'developer_unavailable', developerId: 290607 },
      });
      expect(result).not.toHaveProperty('interaction');
      expect(deps.prepare).not.toHaveBeenCalled();
      expect(deps.submit).not.toHaveBeenCalled();
      expect(deps.call).toHaveBeenCalledTimes(1);
    }
  );

  it('records completed synchronization even if the subsequent QR request fails', async () => {
    const deps = dependencies();
    deps.call.mockRejectedValue(
      Object.assign(new Error('disconnected'), { executionState: 'unknown' })
    );
    expect(
      await executeQrcodeCommand('/project/a', undefined, deps, { confirmedBuild: true })
    ).toMatchObject({ ok: false, unknown: true, requiresSync: false });
    expect(deps.submit).toHaveBeenCalledTimes(1);
    expect(deps.call).toHaveBeenCalledTimes(1);
  });

  it('does not retry an interrupted remote operation', async () => {
    const deps = dependencies();
    deps.call.mockRejectedValue(
      Object.assign(new Error('Connection lost'), {
        executionState: 'unknown',
      })
    );
    expect(await executeQrcodeCommand('/project/a', undefined, deps)).toMatchObject({
      ok: false,
      unknown: true,
    });
    expect(deps.call).toHaveBeenCalledTimes(1);
  });

  it('preserves tool failures instead of reporting QR success', async () => {
    const deps = dependencies();
    deps.call.mockResolvedValue({
      isError: true,
      content: [{ type: 'text', text: 'Build first' }],
    } as never);
    expect(await executeQrcodeCommand('/project/a', undefined, deps)).toMatchObject({
      ok: false,
      error: 'Build first',
    });
  });

  it('does not write orientation or dispatch when access is blocked', async () => {
    const deps = dependencies();
    deps.access.mockResolvedValue({ blocked: true });
    expect(
      await executeQrcodeCommand('/project/a', 'portrait', deps, { confirmedBuild: true })
    ).toMatchObject({ ok: false });
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.submit).not.toHaveBeenCalled();
    expect(deps.preflight).not.toHaveBeenCalled();
    expect(deps.call).not.toHaveBeenCalled();
  });
});
