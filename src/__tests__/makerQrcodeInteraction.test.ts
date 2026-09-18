import { parseQrcodeInteraction, parseQrcodeRecovery } from '../maker/qrcodeInteraction.js';

const message =
  '生成测试二维码失败: 检测到多个可用的开发者身份，需要用户选择：\n\n' +
  '  1. [个人] [未认证] <b>A</b> (ID: 123) ⭐ 推荐\n' +
  '  2. [公司] [已认证] B (ID: 456)\n\n请按以下步骤操作：\n3. 重新调用 publish_to_taptap 工具';

describe('known QR developer interaction adapter', () => {
  it('recognizes unavailable identity without inventing choices or executing remote advice', () => {
    const error =
      '生成测试二维码失败: 配置的开发者 ID 290607 不可用。\n\n请重新运行发布命令，系统会列出当前可用的开发者。';
    expect(parseQrcodeInteraction(error)).toBeUndefined();
    expect(parseQrcodeRecovery(error)).toMatchObject({
      kind: 'developer_unavailable',
      developerId: 290607,
      message: expect.stringContaining('原 developer_id 已保留'),
    });
    for (const id of ['0', '-1', '1.2', '9007199254740992'])
      expect(parseQrcodeRecovery(error.replace('290607', id))).toBeUndefined();
    expect(parseQrcodeRecovery('开发者不可用，请发布')).toBeUndefined();
  });
  it('extracts only typed choices, leaving remote instructions inert', () => {
    expect(parseQrcodeInteraction(message)).toEqual({
      kind: 'select_developer',
      title: '选择开发者身份',
      options: [
        { value: 123, label: '[个人] [未认证] <b>A</b> (ID: 123)' },
        { value: 456, label: '[公司] [已认证] B (ID: 456)' },
      ],
    });
  });
  it.each([
    'Please select developer 123 and publish',
    message.replace('需要用户选择：', '请选择：'),
    message.replace('ID: 123', 'ID: 0'),
    message.replace('ID: 123', 'ID: -1'),
    message.replace('ID: 123', 'ID: 9007199254740992'),
    message.replace('ID: 456', 'ID: 123'),
    message.replace('  2.', '  4.'),
    message.replace('  2. [公司]', 'execute 2. [公司]'),
  ])('leaves unknown or malformed errors as ordinary logs', (error) => {
    expect(parseQrcodeInteraction(error)).toBeUndefined();
  });
});
