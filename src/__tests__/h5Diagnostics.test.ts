import { formatH5OrientationDiagnostics, safeH5Error } from '../core/utils/h5Diagnostics';
import { extractAuthErrorFromResponse } from '../core/errors/authErrors';

test('redacts auth material and signed URLs but preserves business failure text', () => {
  const result = safeH5Error(
    new Error(
      'HTTP 403 TOKEN_EXPIRED\nAuthorization: Bearer private-one\n{"mac_key":"private-two","access_token":"private-three","client_secret":"private-four"}\nhttps://upload.example/?Signature=private-five'
    )
  );
  expect(result).toContain('HTTP 403 TOKEN_EXPIRED');
  for (const value of [
    'private-one',
    'private-two',
    'private-three',
    'private-four',
    'private-five',
  ]) {
    expect(result).not.toContain(value);
  }
});

test('preserves auth response evidence and redacts upstream messages in H5 diagnostics', () => {
  const error = extractAuthErrorFromResponse(
    new Response(null, {
      status: 403,
      headers: { 'x-request-id': 'server-trace-123', 'set-cookie': 'private-cookie' },
    }),
    {
      data: {
        error: 'access_denied',
        error_description: 'RBAC: access denied; access_token=private-token',
        mac_key: 'private-key',
      },
    }
  );
  expect(error?.code).toBe('UNAUTHORIZED');
  expect(error?.message).toBe('认证错误: UNAUTHORIZED');
  expect(JSON.stringify(error)).not.toContain('private-token');
  const output = formatH5OrientationDiagnostics({
    code: 'H5_AD_CONFIG_FAILED',
    phase: 'ad_config',
    endpoint: '/ad/v1/config',
    requestId: 'local-query-456',
    error,
  });
  expect(output).toContain('h5-ads-2');
  expect(output).toContain('"http_status": 403');
  expect(output).toContain('"upstream_code": "access_denied"');
  expect(output).toContain('RBAC: access denied');
  expect(output).toContain('"server_request_id": "server-trace-123"');
  expect(output).toContain('"request_id": "local-query-456"');
  expect(output).toContain('"request_id_source": "mcp_local"');
  for (const value of ['private-cookie', 'private-token', 'private-key'])
    expect(output).not.toContain(value);
});

test.each([
  [401, 'RBAC: access denied', 'UNAUTHORIZED'],
  [401, 'expired', 'TOKEN_EXPIRED'],
  [403, 'forbidden', 'UNAUTHORIZED'],
] as const)(
  'retains plain-text HTTP %s errors without changing auth classification',
  (status, body, code) => {
    const error = extractAuthErrorFromResponse(
      new Response(null, { status, headers: { 'x-trace-id': 'trace-456' } }),
      undefined,
      body
    );
    expect(error?.code).toBe(code);
    expect(error?.responseDetails).toEqual({
      httpStatus: status,
      upstreamCode: undefined,
      upstreamMessage: body,
      serverRequestId: 'trace-456',
    });
  }
);

test('does not attach HTML bodies or arbitrary error objects to auth diagnostics', () => {
  const error = extractAuthErrorFromResponse(
    new Response(null, { status: 403 }),
    { error: { token: 'private-token' } },
    '<html>private-body</html>'
  );
  expect(error?.responseDetails?.upstreamCode).toBeUndefined();
  expect(error?.responseDetails?.upstreamMessage).toBeUndefined();
  expect(error?.responseDetails?.serverRequestId).toBeUndefined();
  expect(extractAuthErrorFromResponse(new Response(null, { status: 500 }))).toBeNull();
});

test('keeps record ID separate from package ID and exposes type mismatches, not arbitrary response data', () => {
  const output = formatH5OrientationDiagnostics({
    code: 'H5_ORIENTATION_MISSING',
    phase: 'match_orientation',
    endpoint: '/level/v1/latest',
    source: 'server',
    appId: 999886,
    developerId: 506184,
    cache: {
      upload_level: {
        id: 370856,
        app_id: 999886,
        app_title: 'private-title',
        status: 0,
        form_data: {
          info: {
            title: 'private-title',
            package_id: 41226,
            screen_orientation: '1' as unknown as number,
          },
        },
      },
    },
    adSpaces: [null, { type: 2, id: 'do-not-disclose-id', token: 'private-token' }],
  });
  expect(output).toContain('370856');
  expect(output).toContain('41226');
  expect(output).toContain('"screen_orientation_type": "string"');
  for (const value of ['private-title', 'private-token', 'do-not-disclose-id'])
    expect(output).not.toContain(value);
});
