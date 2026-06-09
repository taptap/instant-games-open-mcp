import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readWorkflow(name: string) {
  return readFileSync(join(process.cwd(), '.github', 'workflows', name), 'utf8');
}

function getStepBody(workflow: string, stepName: string) {
  const step = workflow.slice(workflow.indexOf(`- name: ${stepName}`));
  const nextStepIndex = step.indexOf('\n      - name:', 1);

  return nextStepIndex === -1 ? step : step.slice(0, nextStepIndex);
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

  it('creates generated release PRs with the release GitHub App token', () => {
    const workflow = readWorkflow('release.yml');

    expect(workflow).toContain('uses: actions/create-github-app-token@v2');
    expect(workflow).toContain('app-id: ${{ secrets.RELEASE_APP_ID }}');
    expect(workflow).toContain('private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}');
    expect(workflow).toContain('token: ${{ steps.app-token.outputs.token }}');
    expect(workflow).toContain('Generate release write app token');
    expect(workflow).toContain('id: write-app-token');

    for (const stepName of ['Create Pull Request', 'Auto-merge PR']) {
      const stepBody = getStepBody(workflow, stepName);

      expect(stepBody).toContain('GH_TOKEN: ${{ steps.write-app-token.outputs.token }}');
      expect(stepBody).not.toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    }

    const releaseStep = getStepBody(workflow, 'Create GitHub Release');
    expect(releaseStep).toContain('GH_TOKEN: ${{ steps.final-app-token.outputs.token }}');
    expect(releaseStep).not.toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });

  it('can recover a timed-out generated release PR without duplicating state', () => {
    const workflow = readWorkflow('release.yml');

    expect(workflow).toContain('Resolve existing release PR');
    expect(workflow).toContain('gh pr list');
    expect(workflow).toContain('--head "$BRANCH"');
    expect(workflow).toContain('state=${PR_STATE}');
    expect(workflow).toContain("if: success() && steps.release_pr.outputs.state != 'MERGED'");
    expect(workflow).toContain("if: success() && steps.release_pr.outputs.url == ''");
    expect(workflow).toContain('if git ls-remote --exit-code --heads origin "$BRANCH"');
    expect(workflow).toContain('Release branch package.json already has version ${VERSION}');
    expect(workflow).toContain('Existing release PR was closed without merging');

    const resolveStep = getStepBody(workflow, 'Resolve existing release PR');
    expect(resolveStep.match(/gh pr list/g)).toHaveLength(1);
    expect(resolveStep.match(/echo "branch=\$\{BRANCH\}"/g)).toHaveLength(1);

    const branchStep = getStepBody(workflow, 'Create release branch');
    expect(branchStep).not.toContain('id: branch');
    expect(branchStep).not.toContain('echo "branch=$BRANCH"');
  });

  it('keeps npm, tag, and GitHub Release creation idempotent for retries', () => {
    const workflow = readWorkflow('release.yml');

    expect(workflow).toContain('Verify or publish npm package');
    expect(workflow).toContain('npm view "@taptap/instant-games-open-mcp@${VERSION}" version');
    expect(workflow).toContain('already exists on npm');
    expect(workflow).toContain('git ls-remote --exit-code --tags origin "v${VERSION}"');
    expect(workflow).toContain('Existing tag v${VERSION} points to');
    expect(workflow).toContain('GitHub Release v${VERSION} already exists');

    const releaseStep = getStepBody(workflow, 'Create GitHub Release');
    expect(releaseStep).toMatch(
      /git config user\.name "github-actions\[bot\]"[\s\S]*git tag -a "v\$\{VERSION\}"/
    );
    expect(releaseStep).toContain('MERGE_COMMIT=${{ steps.wait_for_merge.outputs.merge_commit }}');
    expect(releaseStep).toContain('git checkout -B main "$MERGE_COMMIT"');
    expect(releaseStep).not.toContain('git checkout -B main origin/main');
  });

  it('refreshes the release app token after waiting for PR merge', () => {
    const workflow = readWorkflow('release.yml');

    expect(workflow).toContain('Wait for release PR merge');
    expect(workflow).toContain('Generate final release app token');
    expect(workflow).toContain('id: final-app-token');

    const waitStep = getStepBody(workflow, 'Wait for release PR merge');
    expect(waitStep).toContain('GH_TOKEN: ${{ github.token }}');
    expect(waitStep).toContain('for i in $(seq 1 360)');
    expect(waitStep).toContain('state=${STATE}');
    expect(waitStep).toContain('merge_commit=${MERGE_COMMIT}');

    const releaseStep = getStepBody(workflow, 'Create GitHub Release');
    expect(releaseStep).toContain(
      "if: success() && steps.wait_for_merge.outputs.state == 'MERGED'"
    );
    expect(releaseStep).toContain('GH_TOKEN: ${{ steps.final-app-token.outputs.token }}');
    expect(releaseStep).toContain('AUTHORIZATION: bearer ${GH_TOKEN}');
    expect(releaseStep).not.toContain('for i in $(seq 1 360)');
  });

  it('refreshes the release write app token after build steps before PR operations', () => {
    const workflow = readWorkflow('release.yml');

    const writeTokenStep = getStepBody(workflow, 'Generate release write app token');
    expect(writeTokenStep).toContain('id: write-app-token');
    expect(workflow.indexOf('Generate release write app token')).toBeGreaterThan(
      workflow.indexOf('Run tests')
    );
    expect(workflow.indexOf('Generate release write app token')).toBeLessThan(
      workflow.indexOf('Resolve existing release PR')
    );

    const configureStep = getStepBody(workflow, 'Configure release write app token');
    expect(configureStep).toContain('GH_TOKEN: ${{ steps.write-app-token.outputs.token }}');
    expect(configureStep).toContain('AUTHORIZATION: bearer ${GH_TOKEN}');

    for (const stepName of [
      'Resolve existing release PR',
      'Create Pull Request',
      'Auto-merge PR',
    ]) {
      const stepBody = getStepBody(workflow, stepName);

      expect(stepBody).toContain('GH_TOKEN: ${{ steps.write-app-token.outputs.token }}');
    }
  });

  it('stops release writes after detecting a closed release PR', () => {
    const workflow = readWorkflow('release.yml');

    for (const stepName of [
      'Create release branch',
      'Set release package version',
      'Commit and push release branch',
      'Auto-merge PR',
    ]) {
      const stepBody = getStepBody(workflow, stepName);

      expect(stepBody).toContain("if: success() && steps.release_pr.outputs.state != 'MERGED'");
    }

    const createPrStep = getStepBody(workflow, 'Create Pull Request');
    expect(createPrStep).toContain("if: success() && steps.release_pr.outputs.url == ''");
  });

  it('does not fail when auto-merge is already enabled on a reused release PR', () => {
    const workflow = readWorkflow('release.yml');

    const autoMergeStep = getStepBody(workflow, 'Auto-merge PR');
    expect(autoMergeStep).toContain('autoMergeRequest');
    expect(autoMergeStep).toContain('Auto-merge is already enabled for PR #$PR_NUMBER');
    expect(autoMergeStep).toContain('exit 0');
    expect(autoMergeStep).toMatch(
      /AUTO_MERGE_ENABLED=\$\(gh pr view "\$PR_NUMBER"[\s\S]*gh pr merge "\$PR_NUMBER"/
    );
  });
});
