/**
 * Maker CLI login tests.
 */

import {
  createCliLoginCode,
  getMakerCliLoginResultUrl,
  getMakerCliLoginUrl,
  loginWithCliAuthCode,
} from '../maker/auth/cliLogin';

describe('maker CLI login', () => {
  test('generates URL-safe non-repeating login codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => createCliLoginCode()));

    expect(codes.size).toBe(100);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    }
  });

  test('builds login and result URLs for the selected environment', () => {
    const code = '7cqFPS6OyS7z8D8NXWAjhJvEBNtq9pZi';

    expect(getMakerCliLoginUrl(code, 'rnd')).toBe(
      'https://fuping.agnt.xd.com/pat-tokens?code=7cqFPS6OyS7z8D8NXWAjhJvEBNtq9pZi'
    );
    expect(getMakerCliLoginResultUrl(code, 'rnd')).toBe(
      'https://fuping.agnt.xd.com/api/v1/cli-auth/result?code=7cqFPS6OyS7z8D8NXWAjhJvEBNtq9pZi'
    );
  });

  test('polls empty result until server returns PAT token', async () => {
    const responses = [
      {},
      {
        token: 'tmpct_nQbEmrTTXkNIBWy1dOSf4I1A-vG3ra3e',
        token_prefix: 'tmpct_nQbE',
        name: 'CLI',
        expires_at: '2026-09-03T07:57:39.230Z',
        id: '019e96c9-aa1e-76a8-8839-c2c622850c25',
      },
    ];
    const fetchImpl = jest.fn(async () => {
      const response = responses.shift() || {};
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(response),
      };
    }) as jest.MockedFunction<typeof fetch>;

    const result = await loginWithCliAuthCode({
      env: 'production',
      openBrowser: false,
      pollIntervalMs: 0,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/maker\.taptap\.cn\/api\/v1\/cli-auth\/result\?code=[A-Za-z0-9_-]{16,128}$/
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      })
    );
    expect(result).toMatchObject({
      token: 'tmpct_nQbEmrTTXkNIBWy1dOSf4I1A-vG3ra3e',
      expires_at: '2026-09-03T07:57:39.230Z',
    });
    expect(result.code).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(result.auth_url).toMatch(/\/pat-tokens\?code=[A-Za-z0-9_-]{16,128}$/);
  });

  test('tells users to log in and click create token on the PAT page', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token: 'tmpct_guidance_success' }),
    })) as jest.MockedFunction<typeof fetch>;
    const statuses: string[] = [];

    await loginWithCliAuthCode({
      env: 'rnd',
      openBrowser: false,
      pollIntervalMs: 0,
      fetchImpl,
      onStatus: (message) => statuses.push(message),
    });

    expect(statuses.join('\n')).toContain('点击“创建 token”');
  });

  test('polls every second by default while waiting for authorization', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ token: 'tmpct_default_interval' }),
      } as Response) as jest.MockedFunction<typeof fetch>;

    try {
      const login = loginWithCliAuthCode({
        env: 'rnd',
        openBrowser: false,
        fetchImpl,
      });

      await Promise.resolve();
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      await login;

      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('continues polling after a transient fetch failure', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ token: 'tmpct_retry_success' }),
      } as Response) as jest.MockedFunction<typeof fetch>;

    const result = await loginWithCliAuthCode({
      env: 'rnd',
      openBrowser: false,
      pollIntervalMs: 0,
      requestTimeoutMs: 100,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.token).toBe('tmpct_retry_success');
  });

  test('limits pending poll delay to the login deadline', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    })) as jest.MockedFunction<typeof fetch>;

    try {
      const login = loginWithCliAuthCode({
        env: 'rnd',
        openBrowser: false,
        timeoutMs: 10,
        pollIntervalMs: 1000,
        fetchImpl,
      });
      const rejection = expect(login).rejects.toThrow('Maker CLI login timed out');

      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(10);

      await rejection;
    } finally {
      jest.useRealTimers();
    }
  });
});
