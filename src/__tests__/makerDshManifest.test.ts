import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

  it('uses the published npm package as the DSH marketplace install source', () => {
    const readme = readFileSync(join(REPO_ROOT, 'packages', 'dsh-maker', 'README.md'), 'utf8');
    expect(readme).toContain('dsh plugin --profile web add @taptap/dsh-maker');
    expect(readme).toContain('官方 DSH CLI 直接从 npm registry 安装公开包 `@taptap/dsh-maker`');
    expect(readme).toContain(
      '[DSH 插件市场与分发入口](https://github.com/taptap/instant-games-open-mcp/blob/main/docs/DSH_PLUGIN_MARKETS.md)'
    );
    expect(readme).not.toContain("'github:taptap/instant-games-open-mcp#path:packages/dsh-maker'");
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

  it('renders npm installation only for stable releases', () => {
    const moduleUrl = pathToFileURL(join(REPO_ROOT, 'scripts', 'package-maker-dsh-plugin.js')).href;
    const source = `
      const { createInstallMd } = await import(${JSON.stringify(moduleUrl)});
      process.stdout.write(JSON.stringify({
        stable: createInstallMd('0.1.1', '0.0.32'),
        preview: createInstallMd('0.1.2-dev.7', '0.0.32-beta.3')
      }));
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const guides = JSON.parse(result.stdout);
    expect(guides.stable).toContain('dsh plugin --profile <profile> add @taptap/dsh-maker@0.1.1');
    expect(guides.stable).toContain(
      '改用 tarball 时必须先用同一 Release 的 SHA256SUMS 校验 SHA-256，校验失败时停止安装'
    );
    expect(guides.preview).toContain('下载 tarball、校验 SHA-256、迁移旧 L1 配置、安装、验证');
    expect(guides.preview).toContain('Get-FileHash');
    expect(guides.preview).toContain('shasum -a 256');
    expect(guides.preview).toContain('dsh plugin --profile <profile> add <tarball绝对路径>');
    expect(guides.preview).not.toContain('- npm：`@taptap/dsh-maker@0.1.2-dev.7`');
  });

  it('packages when the entry script is invoked through a symlink', () => {
    const temporaryDir = mkdtempSync(join(tmpdir(), 'dsh-maker-package-symlink-'));
    const scriptLink = join(temporaryDir, 'package-maker-dsh-plugin.js');
    const outputDir = join(temporaryDir, 'output');
    const committedInstallMd = join(REPO_ROOT, 'packages', 'dsh-maker', 'INSTALL.md');

    try {
      symlinkSync(join(REPO_ROOT, 'scripts', 'package-maker-dsh-plugin.js'), scriptLink);
      const installMtime = statSync(committedInstallMd, { bigint: true }).mtimeNs;
      const result = spawnSync(
        process.execPath,
        [scriptLink, '--output-dir', outputDir, '--skip-committed-install-md'],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        }
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Packaged @taptap/dsh-maker');
      expect(statSync(committedInstallMd, { bigint: true }).mtimeNs).toBe(installMtime);
    } finally {
      rmSync(temporaryDir, { recursive: true, force: true });
    }
  });
});
