import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readWorkflow(name: string) {
  return readFileSync(join(process.cwd(), '.github', 'workflows', name), 'utf8');
}

describe('release PR required workflow guards', () => {
  it('runs CodeQL for release PRs targeting main', () => {
    const workflow = readWorkflow('codeql.yml');

    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).not.toContain("startsWith(github.head_ref || '', 'release/')");
  });

  it('reports the review check for release PRs while preserving Maker automation skip', () => {
    const workflow = readWorkflow('claude-review.yml');

    expect(workflow).not.toContain("contains(github.event.pull_request.title, '(release)')");
    expect(workflow).not.toContain("startsWith(github.event.pull_request.title, 'ci(release):')");
    expect(workflow).toContain("contains(github.event.pull_request.title, '(maker)')");
    expect(workflow).toContain("startsWith(github.event.pull_request.title, 'ci(maker):')");
  });
  it('does not add skip-ci directives to generated release PRs', () => {
    const workflow = readWorkflow('release.yml');

    expect(workflow).not.toContain('[skip ci]');
    expect(workflow).not.toContain('[ci skip]');
    expect(workflow).not.toContain('[skip actions]');
  });
});
