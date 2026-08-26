import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

function readWorkflow(name: string) {
  return readFileSync(join(process.cwd(), '.github', 'workflows', name), 'utf8');
}

function readWorkflowDocument(name: string) {
  return parse(readWorkflow(name)) as {
    on?: {
      push?: { branches?: string[] };
      pull_request?: { branches?: string[] };
      workflow_dispatch?: { inputs?: Record<string, unknown> };
    };
    jobs?: Record<
      string,
      {
        environment?: string;
        if?: string;
        needs?: string | string[];
        outputs?: Record<string, string>;
        permissions?: Record<string, string>;
        steps?: Array<{ name?: string; if?: string; run?: string }>;
      }
    >;
  };
}

function readRunScripts(name: string) {
  const workflow = readWorkflowDocument(name);
  return Object.values(workflow.jobs || {})
    .flatMap((job) => job.steps || [])
    .map((step) => step.run)
    .filter((run): run is string => typeof run === 'string');
}

describe('Maker plugin release workflows', () => {
  const prepare = readWorkflow('prepare-maker-plugin-release.yml');
  const publish = readWorkflow('publish-maker-plugin.yml');
  const publishDsh = readWorkflow('publish-dsh-maker-plugin.yml');

  it('fails normally when release inputs are missing instead of reporting a green no-op', () => {
    for (const workflow of [prepare, publish]) {
      expect(workflow).not.toContain('support_ready');
      expect(workflow).not.toContain('exit 0');
      expect(workflow).not.toContain('plugin support has not reached this branch');
      expect(workflow).toContain('name: Require plugin release support');
      expect(workflow).toContain('config/maker-plugin-version.json');
      expect(workflow).toContain('Merge the Maker client plugin implementation before publishing.');
    }
  });

  it('keeps an unpublished configured stable version and only increments a published one', () => {
    expect(prepare).toContain('refs/tags/maker-plugin-v$current_version');
    expect(prepare).toContain('const version=process.argv[1]');
    expect(prepare).toContain('scripts/resolve-maker-plugin-version.js');
    expect(prepare).toContain("title: 'chore(maker): prepare plugin");
  });

  it('publishes stable versions from main and manual prereleases from develop', () => {
    const publishDocument = readWorkflowDocument('publish-maker-plugin.yml');

    expect(publishDocument.on?.push?.branches).toEqual(['main']);
    expect(publish).toContain('Publish from main, or manually dispatch from develop.');
    expect(publish).toContain('EVENT_NAME: ${{ github.event_name }}');
    expect(publish).toContain('REF_NAME: ${{ github.ref_name }}');
    expect(publish).toContain('channel=stable');
    expect(publish).toContain('channel=dev');
    expect(publish).toContain('[[ "$base_version" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+$ ]]');
    expect(publish).toContain('maker-plugin-v$base_version');
    expect(publish).toContain('refs/tags/maker-plugin-v$base_version');
    expect(publish).toContain('next_version');
    expect(publish).toContain('--prerelease');
    expect(publish).toContain('p.version=process.argv[1]');
    expect(publish).toContain("path='.codebuddy-plugin/marketplace.json'");
  });

  it('passes GitHub values to shell through environment variables', () => {
    for (const workflowName of [
      'prepare-maker-plugin-release.yml',
      'publish-maker-plugin.yml',
      'publish-dsh-maker-plugin.yml',
    ]) {
      for (const run of readRunScripts(workflowName)) {
        expect(run).not.toContain('${{');
      }
    }
  });

  it('runs the normal PR quality checks for develop changes', () => {
    const prCheck = readWorkflowDocument('pr.yml');
    const codeql = readWorkflowDocument('codeql.yml');
    expect(prCheck.on?.pull_request?.branches).toContain('develop');
    expect(codeql.on?.pull_request?.branches).toContain('develop');
  });

  it('pins actions that receive the release private key or token', () => {
    for (const workflow of [prepare, publish, publishDsh]) {
      expect(workflow).toContain('actions/checkout@11d5960a326750d5838078e36cf38b85af677262');
      expect(workflow).toContain('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020');
      expect(workflow).not.toContain('actions/checkout@v4');
      expect(workflow).not.toContain('actions/setup-node@v4');
    }
    expect(prepare).toContain(
      'actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349'
    );
    expect(prepare).toContain(
      'peter-evans/create-pull-request@c5a7806660adbe173f04e3e038b0ccdcd758773c'
    );
    expect(prepare).not.toContain('actions/create-github-app-token@v2');
    expect(prepare).not.toContain('peter-evans/create-pull-request@v6');
  });

  it('grants write permissions only to jobs that publish repository state', () => {
    for (const workflow of [prepare, publish, publishDsh]) {
      expect(workflow).toContain('permissions:\n  contents: read');
    }
    expect(prepare).not.toContain('contents: write');
    expect(prepare).not.toContain('pull-requests: write');
    expect(publish).toContain('permissions:\n      contents: write');
    const dshWorkflow = readWorkflowDocument('publish-dsh-maker-plugin.yml');
    expect(dshWorkflow.jobs?.prepare?.environment).toBeUndefined();
    expect(dshWorkflow.jobs?.prepare?.permissions?.['id-token']).toBeUndefined();
    expect(dshWorkflow.jobs?.['publish-npm']?.permissions).toEqual({
      contents: 'read',
    });
    expect(dshWorkflow.jobs?.['publish-release']?.permissions).toEqual({
      contents: 'write',
    });
  });

  it('keeps DSH publishing manual and separates develop previews from stable releases', () => {
    const workflow = readWorkflowDocument('publish-dsh-maker-plugin.yml');

    expect(workflow.on?.push).toBeUndefined();
    expect(workflow.on?.workflow_dispatch?.inputs).toHaveProperty('maker_version');
    expect(workflow.on?.workflow_dispatch?.inputs?.use_create_package_token).toEqual(
      expect.objectContaining({
        default: false,
        type: 'boolean',
      })
    );
    expect(publishDsh).toContain('Manually dispatch from main or develop.');
    expect(publishDsh).toContain('name: Require DSH plugin release support');
    expect(publishDsh).toContain('Selected branch does not contain DSH plugin release support');
    expect(publishDsh).toContain('develop previews require an exact prerelease maker_version.');
    expect(publishDsh).toContain('develop previews require a prerelease @taptap/maker version.');
    expect(publishDsh).toContain('Stable DSH releases cannot depend on prerelease');
    expect(publishDsh).toContain('npm view "@taptap/maker@${MAKER_VERSION}" version');
  });

  it('publishes stable DSH releases to npm without publishing develop previews', () => {
    const workflow = readWorkflowDocument('publish-dsh-maker-plugin.yml');
    const prepareJob = workflow.jobs?.prepare;
    const npmPublishJob = workflow.jobs?.['publish-npm'];
    const releaseJob = workflow.jobs?.['publish-release'];
    const prepareNpmStep = prepareJob?.steps?.find(
      (step) => step.name === 'Pin npm for reproducible packaging'
    );
    const upgradeStep = npmPublishJob?.steps?.find(
      (step) => step.name === 'Upgrade npm for token publishing'
    );
    const npmPublishStep = npmPublishJob?.steps?.find(
      (step) => step.name === 'Publish stable package to npm'
    );

    expect(prepareJob?.outputs).toEqual(
      expect.objectContaining({
        channel: '${{ steps.version.outputs.channel }}',
        version: '${{ steps.version.outputs.version }}',
        tag: '${{ steps.version.outputs.tag }}',
      })
    );
    expect(npmPublishJob?.environment).toBe('dsh_npm_publish');
    expect(npmPublishJob?.if).toContain("github.ref_name == 'main'");
    expect(npmPublishJob?.if).toContain("needs.prepare.outputs.channel == 'stable'");
    expect(releaseJob?.needs).toEqual(['prepare', 'publish-npm']);
    expect(releaseJob?.if).toContain("needs.publish-npm.result == 'success'");
    expect(releaseJob?.if).toContain("needs.publish-npm.result == 'skipped'");
    expect(publishDsh).toContain('registry-url: https://registry.npmjs.org');
    expect(prepareNpmStep?.run).toContain('npm install -g npm@11.5.1');
    expect(upgradeStep?.run).toContain('npm install -g npm@11.5.1');
    expect(npmPublishStep?.run).toContain('npm publish "$tarball" --access public --tag latest');
    expect(npmPublishStep?.run).not.toContain('--provenance');
    expect(npmPublishJob?.permissions).toEqual({ contents: 'read' });
    expect(publishDsh).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}');
    expect(publishDsh).toContain('NPM_CREATE_PKG_TOKEN: ${{ secrets.NPM_CREATE_PKG_TOKEN }}');
    expect(publishDsh).toContain(
      'USE_CREATE_PACKAGE_TOKEN: ${{ inputs.use_create_package_token }}'
    );
    expect(npmPublishStep?.run).toContain('npm view "@taptap/dsh-maker@${RELEASE_VERSION}"');
    expect(npmPublishStep?.run).toContain('npm view "@taptap/dsh-maker" version');
    expect(npmPublishStep?.run).toContain('NODE_AUTH_TOKEN="$NPM_CREATE_PKG_TOKEN" npm publish');
    expect(npmPublishStep?.run).toContain('(cd artifacts/dsh-maker && sha256sum -c SHA256SUMS)');
    for (const requiredPath of [
      'package/lib/index.js',
      'package/cordis.patch.yml',
      'package/skills/taptap-maker-dsh/SKILL.md',
      'package/assets/taptap-maker.png',
    ]) {
      expect(npmPublishStep?.run).toContain(requiredPath);
    }

    expect(releaseJob?.steps?.some((step) => step.name === 'Publish GitHub Release')).toBe(true);
  });

  it('detects tracked and untracked generated changes and uses one package entry point', () => {
    expect(publish).toContain('git status --porcelain');
    expect(prepare).toContain('npm run maker:plugins:package --');
    expect(publish).toContain('npm run maker:plugins:package --');
    expect(publish).not.toContain('node scripts/package-maker-client-plugins.js --output-dir');
  });
});
