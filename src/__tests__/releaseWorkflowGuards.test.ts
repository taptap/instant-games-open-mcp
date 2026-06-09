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

  it('keeps Claude review workflow identical to main to satisfy action validation', () => {
    const workflow = readWorkflow('claude-review.yml');

    expect(workflow).toContain("contains(github.event.pull_request.title, '(release)')");
    expect(workflow).toContain("startsWith(github.event.pull_request.title, 'ci(release):')");
  });

  it('provides a deterministic review guard for generated release PRs', () => {
    const workflow = readWorkflow('release-review-guard.yml');

    expect(workflow).toContain('name: Release PR Review Guard');
    expect(workflow).toContain('name: review');
    expect(workflow).toContain("if: startsWith(github.head_ref || '', 'release/')");
    expect(workflow).not.toContain("startsWith(github.event.pull_request.title, 'ci(release):')");
    expect(workflow).toContain('Validate generated release PR');
    expect(workflow).toContain('git diff --name-only "$BASE_SHA...$HEAD_SHA"');
    expect(workflow).toContain('Unexpected file in release PR');
    expect(workflow).toContain('package.json version');
  });

  it('does not add skip-ci directives to generated release PRs', () => {
    const workflow = readWorkflow('release.yml');

    expect(workflow).not.toContain('[skip ci]');
    expect(workflow).not.toContain('[ci skip]');
    expect(workflow).not.toContain('[skip actions]');
  });
});
