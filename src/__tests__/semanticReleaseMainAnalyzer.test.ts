import { createRequire } from 'node:module';

const nodeRequire = createRequire(__filename);

jest.mock('@semantic-release/commit-analyzer', () => ({
  analyzeCommits: jest.fn(),
}));

jest.mock('node:child_process', () => ({
  execFileSync: jest.fn((command, args) => {
    const commit = args[args.length - 1];
    if (commit === 'maker-sha') {
      return 'src/maker/index.ts\nskills/taptap-maker-local/SKILL.md\n';
    }
    if (commit === 'mixed-sha') {
      return 'src/maker/index.ts\nsrc/server.ts\n';
    }
    return 'src/features/app/tools.ts\n';
  }),
}));

const analyzer = nodeRequire('../../scripts/semantic-release-main-analyzer.cjs');

describe('semantic-release main analyzer wrapper', () => {
  const logger = { log: jest.fn() };

  beforeEach(() => {
    logger.log.mockClear();
  });

  it('filters Maker-only commits without relying on the squash message marker', () => {
    const commits = [
      {
        hash: 'maker-sha',
        subject: 'feat: add init shortcut',
        message: 'feat: add init shortcut',
      },
      {
        hash: 'main-sha',
        subject: 'fix(app): improve app selection',
        message: 'fix(app): improve app selection',
      },
    ];

    const filtered = analyzer.filterMainPackageCommits(commits, logger);

    expect(filtered).toEqual([commits[1]]);
  });

  it('keeps maker-marked commits that touch shared files', () => {
    const commits = [
      {
        hash: 'mixed-sha',
        subject: 'feat(maker): update root exports',
        message: 'feat(maker): update root exports',
      },
    ];

    const filtered = analyzer.filterMainPackageCommits(commits, logger);

    expect(filtered).toEqual(commits);
  });
});
