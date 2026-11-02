import * as signer from '../core/network/nativeSigner';
import { logger } from '../core/utils/logger';
import { HttpClient } from '../core/network/httpClient';
import { ResolvedContext } from '../core/types/context';
import * as appApi from '../features/app/api';
import { updateAppInfo } from '../features/app/handlers';

const args = { appId: 999886, developerId: 506184, screenOrientation: 1 };
const context = new ResolvedContext({ _project_id: 'h5-submit-tests' }, {});
const cache = (direction: number) => ({
  app_id: args.appId,
  developer_id: args.developerId,
  upload_level: {
    id: 370856,
    app_id: args.appId,
    app_title: 'game',
    status: 0,
    form_data: { info: { title: 'game', package_id: 41226, screen_orientation: direction } },
  },
});

afterEach(() => jest.restoreAllMocks());

test('submits the documented form content type, without inventing a package ID for metadata edits', async () => {
  const post = jest.spyOn(HttpClient.prototype, 'post').mockResolvedValue({});
  jest.spyOn(appApi, 'selectApp').mockResolvedValue(cache(1));
  const result = await updateAppInfo(args, context);
  expect(post).toHaveBeenCalledWith(
    '/level/v1/submit',
    expect.objectContaining({
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: expect.objectContaining({
        app_id: args.appId,
        developer_id: args.developerId,
        package_id: undefined,
        screen_orientation: 1,
      }),
    })
  );
  expect(result).toContain('H5_ORIENTATION_READBACK_CONFIRMED');
  expect(result).toContain('不代表审核通过');
  expect(result).toContain('370856');
  expect(result).toContain('41226');
});

test.each([0, 2])('does not claim success for a direction mismatch (%s)', async (direction) => {
  jest.spyOn(appApi, 'editAppInfo').mockResolvedValue({});
  jest.spyOn(appApi, 'selectApp').mockResolvedValue(cache(direction));
  const result = await updateAppInfo(args, context);
  expect(result).toContain('H5_ORIENTATION_UNCONFIRMED');
  expect(result).toContain('请勿重复提交');
  expect(result).toContain('"source": "server"');
  expect(result).not.toContain('应用信息更新成功');
});

test('preserves query failure details and never treats stale data as a successful readback', async () => {
  jest.spyOn(appApi, 'editAppInfo').mockResolvedValue({});
  jest.spyOn(appApi, 'selectApp').mockRejectedValue(new Error('HTTP 401 TOKEN_EXPIRED'));
  const result = await updateAppInfo(args, context);
  expect(result).toContain('HTTP 401 TOKEN_EXPIRED');
  expect(result).toContain('H5_ORIENTATION_UNCONFIRMED');
  expect(result).toContain('"source": "unavailable"');
});

test('reports a submit timeout as unknown without retrying, with redacted diagnostics', async () => {
  const edit = jest
    .spyOn(appApi, 'editAppInfo')
    .mockRejectedValue(
      new Error('Request timeout after 30000ms https://example.test/?token=private-value')
    );
  const select = jest.spyOn(appApi, 'selectApp');
  const result = await updateAppInfo(args, context);
  expect(result).toContain('H5_SUBMIT_UNCONFIRMED');
  expect(result).toContain('不要自动重复提交');
  expect(result).not.toContain('private-value');
  expect(edit).toHaveBeenCalledTimes(1);
  expect(select).not.toHaveBeenCalled();
});

test('invalid orientation never makes a remote write', async () => {
  const edit = jest.spyOn(appApi, 'editAppInfo');
  expect(await updateAppInfo({ ...args, screenOrientation: 0 }, context)).toContain(
    'H5_INVALID_ORIENTATION'
  );
  expect(edit).not.toHaveBeenCalled();
});

test('serializes and signs the actual form bytes, including comma-separated screenshots', async () => {
  jest.spyOn(signer, 'getClientIdSync').mockReturnValue('test-client');
  const sign = jest.spyOn(signer, 'computeTapSignSync').mockReturnValue('test-signature');
  jest.spyOn(context, 'resolveToken').mockReturnValue({
    kid: 'test-kid',
    mac_key: 'test-key',
    token_type: 'mac',
    mac_algorithm: 'hmac-sha-1',
  });
  jest.spyOn(logger, 'logRequest').mockResolvedValue(undefined);
  jest.spyOn(logger, 'logResponse').mockResolvedValue(undefined);
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: {} }), {
      headers: { 'content-type': 'application/json' },
    })
  );
  await appApi.editAppInfo(
    999886,
    506184,
    41226,
    '游戏 & title',
    undefined,
    undefined,
    undefined,
    undefined,
    1,
    undefined,
    undefined,
    ['https://example.test/a.png', 'https://example.test/b.png'],
    undefined,
    context
  );
  const request = fetchMock.mock.calls[0][1]!;
  expect(request.headers).toEqual(
    expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' })
  );
  const body = request.body as string;
  const form = new URLSearchParams(body);
  expect(form.get('screen_orientation')).toBe('1');
  expect(form.get('package_id')).toBe('41226');
  expect(form.get('title')).toBe('游戏 & title');
  expect(form.get('screenshots')).toBe('https://example.test/a.png,https://example.test/b.png');
  expect(form.has('description')).toBe(false);
  expect(sign.mock.calls[0][3]).toBe(body);
});
