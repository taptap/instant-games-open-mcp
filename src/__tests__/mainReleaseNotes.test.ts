import { createRequire } from 'node:module';

const nodeRequire = createRequire(__filename);
const releaseNotes = nodeRequire('../../scripts/generate-main-release-notes.cjs');

describe('main package release notes', () => {
  it('formats conventional commits into filtered release sections', () => {
    const output = releaseNotes.buildReleaseNotes({
      version: '1.24.0',
      date: new Date('2026-06-01T00:00:00.000Z'),
      commits: [
        { hash: '1234567890', subject: 'feat(app): add selection guard' },
        { hash: 'abcdef1234', subject: 'fix(proxy): repair token passthrough' },
        { hash: 'fedcba9876', subject: 'style(ui): format toolbar' },
      ],
    });

    expect(output).toContain('## <small>1.24.0 (2026-06-01)</small>');
    expect(output).toContain('### Features');
    expect(output).toContain('* app: add selection guard (1234567)');
    expect(output).toContain('### Bug Fixes');
    expect(output).toContain('* proxy: repair token passthrough (abcdef1)');
    expect(output).toContain('### Styles');
    expect(output).toContain('* ui: format toolbar (fedcba9)');
  });

  it('filters temporary non-conventional planning commits from release notes', () => {
    const output = releaseNotes.buildReleaseNotes({
      version: '1.24.0',
      date: new Date('2026-06-01T00:00:00.000Z'),
      commits: [
        { hash: '1111111111', subject: 'Initial plan for release isolation' },
        { hash: '2222222222', subject: 'WIP: update release workflow' },
        { hash: '3333333333', subject: 'TODO add release notes' },
        { hash: '4444444444', subject: 'FIXME release guard' },
        { hash: '5555555555', subject: 'manual maintenance note' },
      ],
    });

    expect(output).not.toContain('Initial plan');
    expect(output).not.toContain('WIP');
    expect(output).not.toContain('TODO');
    expect(output).not.toContain('FIXME');
    expect(output).toContain('* manual maintenance note (5555555)');
  });
});
