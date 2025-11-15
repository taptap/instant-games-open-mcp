/**
 * Commitlint 配置
 *
 * 强制执行 Conventional Commits 规范
 * 确保 commit 消息格式正确，以便 semantic-release 正确分析
 *
 * Commit 消息格式：
 * <type>(<scope>): <subject>
 *
 * 示例：
 * - feat: add new feature
 * - feat(api): add user authentication
 * - fix: fix critical bug
 * - fix!: breaking change in API
 * - feat!: BREAKING CHANGE in auth flow
 */

module.exports = {
  extends: ['@commitlint/config-conventional'],

  // 自定义规则
  rules: {
    // Type 必须是以下之一
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // Bug 修复
        'docs',     // 文档更新
        'style',    // 代码格式（不影响代码运行）
        'refactor', // 重构（既不是新功能也不是修复）
        'perf',     // 性能优化
        'test',     // 测试
        'build',    // 构建系统或外部依赖变更
        'ci',       // CI 配置文件和脚本变更
        'chore',    // 其他不修改 src 或测试文件的变更
        'revert'    // 回退之前的 commit
      ]
    ],

    // Type 必须小写
    'type-case': [2, 'always', 'lower-case'],

    // Type 不能为空
    'type-empty': [2, 'never'],

    // Subject 不能为空
    'subject-empty': [2, 'never'],

    // Subject 不能以句号结尾
    'subject-full-stop': [2, 'never', '.'],

    // Subject 最小长度
    'subject-min-length': [2, 'always', 5],

    // Subject 最大长度
    'subject-max-length': [2, 'always', 100],

    // Header 最大长度（整个第一行）
    'header-max-length': [2, 'always', 100],

    // Body 前必须有空行
    'body-leading-blank': [2, 'always'],

    // Footer 前必须有空行
    'footer-leading-blank': [2, 'always'],

    // Scope 使用小写
    'scope-case': [2, 'always', 'lower-case']
  },

  // 忽略某些 commit（如 merge commits）
  ignores: [
    (commit) => commit.includes('Merge'),
    (commit) => commit.includes('[skip ci]')
  ],

  // 帮助信息
  helpUrl: 'https://github.com/conventional-changelog/commitlint/#what-is-commitlint'
};
