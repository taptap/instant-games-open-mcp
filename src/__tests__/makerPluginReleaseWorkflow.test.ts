import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readWorkflow(name: string) {
  return readFileSync(join(process.cwd(), '.github', 'workflows', name), 'utf8');
}

describe('Maker plugin release workflows', () => {
  const prepare = readWorkflow('prepare-maker-plugin-release.yml');
  const publish = readWorkflow('publish-maker-plugin.yml');

  it('gates release jobs until plugin support is present', () => {
    for (const workflow of [prepare, publish]) {
      expect(workflow).toContain('name: Check plugin release support');
      expect(workflow).toContain('support_ready');
      expect(workflow).toContain("needs.preflight.outputs.support_ready == 'true'");
      expect(workflow).toContain('package.json#scripts.$script');
    }
    expect(publish).toContain('.codebuddy-plugin/marketplace.json');
  });

  it('keeps an unpublished configured stable version and only increments a published one', () => {
    expect(prepare).toContain('refs/tags/maker-plugin-v$current_version');
    expect(prepare).toContain('const version=process.argv[1]');
    expect(prepare).toContain('scripts/resolve-maker-plugin-version.js');
    expect(prepare).toContain("title: 'chore(maker): prepare plugin");
  });

  it('supports stable main releases and public develop prereleases', () => {
    expect(publish).toContain("github.ref_name == 'main' || github.ref_name == 'develop'");
    expect(publish).toContain('channel=stable');
    expect(publish).toContain('channel=dev');
    expect(publish).toContain('maker-plugin-v$base_version');
    expect(publish).toContain('refs/tags/maker-plugin-v$base_version');
    expect(publish).toContain('next_version');
    expect(publish).toContain('--prerelease');
    expect(publish).toContain('p.version=process.argv[1]');
    expect(publish).toContain("path='.codebuddy-plugin/marketplace.json'");
  });

  it('pins actions that receive the release private key or token', () => {
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
      expect(workflow).toContain('permissions:\n      contents: write');
    }
    expect(prepare).toContain('pull-requests: write');
  });

  it('detects tracked and untracked generated changes and uses one package entry point', () => {
    expect(publish).toContain('git status --porcelain');
    expect(prepare).toContain('npm run maker:plugins:package --');
    expect(publish).toContain('npm run maker:plugins:package --');
    expect(publish).not.toContain('node scripts/package-maker-client-plugins.js --output-dir');
  });
});
