import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

function readWorkflow(name: string) {
  return readFileSync(join(process.cwd(), '.github', 'workflows', name), 'utf8');
}

function readWorkflowDocument(name: string) {
  return parse(readWorkflow(name)) as {
    on?: { push?: { branches?: string[] }; pull_request?: { branches?: string[] } };
    jobs?: Record<string, { steps?: Array<{ run?: string }> }>;
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
    for (const workflowName of ['prepare-maker-plugin-release.yml', 'publish-maker-plugin.yml']) {
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
    for (const workflow of [prepare, publish]) {
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
    for (const workflow of [prepare, publish]) {
      expect(workflow).toContain('permissions:\n  contents: read');
    }
    expect(prepare).not.toContain('contents: write');
    expect(prepare).not.toContain('pull-requests: write');
    expect(publish).toContain('permissions:\n      contents: write');
  });

  it('detects tracked and untracked generated changes and uses one package entry point', () => {
    expect(publish).toContain('git status --porcelain');
    expect(prepare).toContain('npm run maker:plugins:package --');
    expect(publish).toContain('npm run maker:plugins:package --');
    expect(publish).not.toContain('node scripts/package-maker-client-plugins.js --output-dir');
  });
});
