/**
 * Semantic Release 配置
 *
 * 自动化版本管理和发布流程
 * - 分析 commit 消息确定版本号
 * - 生成 CHANGELOG
 * - 发布到 npm
 * - 创建 GitHub Release
 */

module.exports = {
  // 支持的分支和发布策略
  branches: [
    // 主分支 - 稳定版本
    'main',

    // 下一个主版本预览
    'next',

    // Beta 测试版本
    {
      name: 'beta',
      prerelease: true
    },

    // Alpha 早期测试版本
    {
      name: 'alpha',
      prerelease: true
    },

    // 支持多个 beta 分支（如 beta/feature-a）
    {
      name: 'beta/*',
      prerelease: '${name.replace(/^beta\\//, "")}'
    },

    // 维护旧版本（如 1.x, 2.x）
    {
      name: '1.x',
      range: '1.x',
      channel: '1.x'
    }
  ],

  // 插件配置
  plugins: [
    // 1. 分析 commit 消息，确定版本号变更类型
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        // 🔒 禁用 Footer 中的 BREAKING CHANGE 识别
        // 只识别 Header 中的 ! 标记（如 feat!:, fix!:）
        // 这样可以防止意外触发 major 版本更新
        // Footer 中的 BREAKING CHANGE: 不再触发 major，但 Header 中的 ! 仍然有效
        parserOpts: {
          noteKeywords: ['MANUAL-BREAKING-CHANGE-DO-NOT-USE']
        },
        releaseRules: [
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'revert', release: 'patch' },
          { type: 'docs', release: false },
          { type: 'style', release: false },
          { type: 'chore', release: false },
          { type: 'refactor', release: 'patch' },
          { type: 'test', release: false },
          { type: 'build', release: false },
          { type: 'ci', release: false },
          { breaking: true, release: 'major' }
        ]
      }
    ],

    // 2. 生成 release notes
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: '✨ Features' },
            { type: 'fix', section: '🐛 Bug Fixes' },
            { type: 'perf', section: '⚡ Performance' },
            { type: 'revert', section: '⏪ Reverts' },
            { type: 'docs', section: '📚 Documentation' },
            { type: 'style', section: '💄 Styles' },
            { type: 'chore', section: '🔧 Chores', hidden: false },
            { type: 'refactor', section: '♻️ Refactoring' },
            { type: 'test', section: '✅ Tests' },
            { type: 'build', section: '📦 Build' },
            { type: 'ci', section: '🤖 CI' }
          ]
        }
      }
    ],

    // 3. 更新 CHANGELOG.md
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
        changelogTitle: '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).'
      }
    ],

    // 4. 更新 package.json 版本号并发布到 npm
    // dry-run 时禁用 npm 发布（实际发布由 OIDC Trusted Publishing 处理）
    [
      '@semantic-release/npm',
      {
        npmPublish: !process.env.SEMANTIC_RELEASE_DRY_RUN,
        tarballDir: 'dist'
      }
    ],

    // 5. 提交 package.json 和 CHANGELOG.md 的变更
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'package-lock.json', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
      }
    ],

    // 6. 创建 GitHub Release
    [
      '@semantic-release/github',
      {
        assets: [
          {
            path: 'dist/*.tgz',
            label: 'Distribution'
          }
        ]
      }
    ]
  ]
};
