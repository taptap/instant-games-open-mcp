/**
 * 远端 Maker MAC 过期识别测试。
 */

import { isMakerMacExpiredFailure } from '../maker/auth/macExpired';

describe('maker MAC expiry detection', () => {
  test('recognizes the get_ad_config JSON body observed from maker-tools', () => {
    expect(
      isMakerMacExpiredFailure({
        success: false,
        error: '授权已失效',
      })
    ).toBe(true);
  });

  test('recognizes a proxy tool text result wrapping that JSON body', () => {
    expect(
      isMakerMacExpiredFailure({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: false, error: '授权已失效' }),
          },
        ],
      })
    ).toBe(true);
  });

  test('recognizes Tap Open API access_denied without permission wording', () => {
    expect(
      isMakerMacExpiredFailure({
        data: { error: 'access_denied', msg: 'token expired' },
      })
    ).toBe(true);
  });

  test('ignores permission or RBAC access_denied', () => {
    expect(
      isMakerMacExpiredFailure({
        data: { error: 'access_denied', msg: 'RBAC access denied' },
      })
    ).toBe(false);
  });

  test('ignores ordinary business failures', () => {
    expect(
      isMakerMacExpiredFailure({
        success: false,
        error: '项目配置中缺少 app_id 或 developer_id。',
      })
    ).toBe(false);
  });
});
