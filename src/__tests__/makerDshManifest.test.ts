import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();

const DSH_SKILL_NAMES = [
  'taptap-maker-dsh',
  'taptap-ads',
  'taptap-cloud-save',
  'taptap-leaderboard',
];

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8'));
}

describe('@taptap/dsh-maker manifest', () => {
  it('declares the standard DSH bundle shape', () => {
    const manifest = readJson('packages/dsh-maker/package.json');
    expect(manifest.name).toBe('@taptap/dsh-maker');
    expect(manifest.type).toBe('module');
    expect(manifest.main).toBe('lib/index.js');
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml');
  });

  it('pins the stable package source to an exact stable Maker version', () => {
    const manifest = readJson('packages/dsh-maker/package.json');
    expect(manifest.dependencies['@taptap/maker']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('gates DSH releases on the exact Maker runtime being published first', () => {
    const workflow = readFileSync(
      join(REPO_ROOT, '.github', 'workflows', 'publish-dsh-maker-plugin.yml'),
      'utf8'
    );
    expect(workflow).toContain("manifest.dependencies['@taptap/maker']");
    expect(workflow).toContain('npm view "@taptap/maker@${MAKER_VERSION}" version');
    expect(workflow).toContain('Publish @taptap/maker@$MAKER_VERSION first');
    expect(workflow).toContain('RELEASE_CHANNEL: ${{ steps.version.outputs.channel }}');
    expect(workflow).toContain('Stable DSH releases cannot depend on prerelease');
    expect(workflow).toContain('REQUESTED_MAKER_VERSION: ${{ inputs.maker_version }}');
    expect(workflow).toContain("j.dependencies['@taptap/maker']=process.argv[2]");
  });

  it('declares the DSH rc.6 peer surface', () => {
    const manifest = readJson('packages/dsh-maker/package.json');
    expect(manifest.peerDependencies['@deepseek-ai/cordis']).toBe('^4.0.1');
    for (const name of [
      '@deepseek-ai/dsh-mcp-client',
      '@deepseek-ai/dsh-skill-filesystem',
      '@deepseek-ai/dsh-shell-env',
    ]) {
      expect(manifest.peerDependencies[name]).toBe('^0.1.0-rc.6');
    }
  });

  it('ships every skill with valid name + description frontmatter', () => {
    for (const skillName of DSH_SKILL_NAMES) {
      expect(skillName).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      const content = readFileSync(
        join(REPO_ROOT, 'packages', 'dsh-maker', 'skills', skillName, 'SKILL.md'),
        'utf8'
      );
      expect(content).toContain(`name: ${skillName}`);
      expect(content).toMatch(/^description: .+/m);
    }
  });

  it('resolves the bundled skills dir from the package root, not lib/', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'packages', 'dsh-maker', 'lib', 'index.js'),
      'utf8'
    );
    // PACKAGE_ROOT must climb out of lib/ before joining skills, otherwise the
    // tarball's package/skills is never found.
    expect(source).toMatch(/const __dirname = path\.dirname\(fileURLToPath\(import\.meta\.url\)\)/);
    expect(source).toMatch(/const PACKAGE_ROOT = path\.dirname\(__dirname\)/);
    expect(source).toMatch(/bundledSkillDir: path\.join\(PACKAGE_ROOT, 'skills'\)/);
  });

  it('registers only valid DSH shell environment variables', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'packages', 'dsh-maker', 'lib', 'index.js'),
      'utf8'
    );
    const registration = source.match(/ctx\.shellEnv\.register\(\{([\s\S]*?)\n\s{2}\}\);/)?.[1];
    expect(registration).toBeDefined();
    const declaredKeys = [...(registration || '').matchAll(/^\s{6}([A-Z][A-Z0-9_]+): \{/gm)].map(
      (match) => match[1]
    );
    expect(declaredKeys).toEqual(['DSH_TAPTAP_MAKER_BIN']);
    expect(declaredKeys.every((key) => /^DSH_[A-Z][A-Z0-9_]*$/.test(key))).toBe(true);
  });

  it('uses the package-explicit npx fallback and an isolated project policy update', () => {
    const skill = readFileSync(
      join(REPO_ROOT, 'packages', 'dsh-maker', 'skills', 'taptap-maker-dsh', 'SKILL.md'),
      'utf8'
    );
    const packageScript = readFileSync(
      join(REPO_ROOT, 'scripts', 'package-maker-dsh-plugin.js'),
      'utf8'
    );
    for (const content of [skill, packageScript]) {
      expect(content).toContain('npx -y --package @taptap/maker@');
      expect(content).not.toMatch(/npx -y @taptap\/maker@[^\s`]+ taptap-maker/);
    }
    expect(skill).toContain('agents update --target-dir');
    expect(skill).not.toContain('"$DSH_TAPTAP_MAKER_BIN" upgrade');
  });

  it('labels generated install guides from the actual release version', () => {
    const packageScript = readFileSync(
      join(REPO_ROOT, 'scripts', 'package-maker-dsh-plugin.js'),
      'utf8'
    );
    expect(packageScript).toContain("version.includes('-dev.')");
    expect(packageScript).toContain('develop 预览版');
    expect(packageScript).toContain('main 稳定版');
    expect(packageScript).toContain('- 发布渠道：\\`${releaseChannel}\\`');
  });
});
