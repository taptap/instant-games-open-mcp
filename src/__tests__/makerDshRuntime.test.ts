import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

function writeModule(root: string, name: string, source: string): void {
  const packageDir = join(root, 'node_modules', ...name.split('/'));
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify({ name, type: 'module', main: 'index.js' }),
    'utf8'
  );
  writeFileSync(join(packageDir, 'index.js'), source, 'utf8');
}

describe('@taptap/dsh-maker runtime', () => {
  it('activates with valid shell keys and passes DSH identity only to the MCP child', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-maker-runtime-'));
    mkdirSync(join(root, 'lib'), { recursive: true });
    cpSync(
      join(REPO_ROOT, 'packages', 'dsh-maker', 'lib', 'index.js'),
      join(root, 'lib', 'index.js')
    );
    writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');

    writeModule(root, '@deepseek-ai/dsh-mcp-client', 'export const name = "mcp-client";');
    writeModule(root, '@deepseek-ai/dsh-skill-filesystem', 'export const name = "skills";');
    writeModule(root, '@taptap/maker', 'export default {};');
    const makerPackageDir = join(root, 'node_modules', '@taptap', 'maker');
    mkdirSync(join(makerPackageDir, 'dist'), { recursive: true });
    mkdirSync(join(makerPackageDir, 'bin'), { recursive: true });
    writeFileSync(join(makerPackageDir, 'dist', 'maker.js'), '', 'utf8');
    writeFileSync(join(makerPackageDir, 'bin', 'taptap-maker'), '', 'utf8');
    writeFileSync(
      join(makerPackageDir, 'package.json'),
      JSON.stringify({
        name: '@taptap/maker',
        type: 'module',
        main: 'dist/maker.js',
      }),
      'utf8'
    );

    writeFileSync(
      join(root, 'run.mjs'),
      `import * as plugin from './lib/index.js';
const pluginConfigs = [];
const shellRegistrations = [];
const ctx = {
  plugin(_plugin, config) {
    pluginConfigs.push(config);
  },
  shellEnv: {
    register(contributor) {
      for (const key of Object.keys(contributor.variables)) {
        if (!/^DSH_[A-Z][A-Z0-9_]*$/.test(key)) {
          throw new Error('invalid DSH shell key: ' + key);
        }
      }
      shellRegistrations.push(contributor.resolve());
    },
  },
};
await plugin.apply(ctx);
process.stdout.write(JSON.stringify({ pluginConfigs, shellRegistrations }));
`,
      'utf8'
    );
    const result = spawnSync(process.execPath, [join(root, 'run.mjs')], {
      cwd: root,
      encoding: 'utf8',
    });
    const pluginSource = readFileSync(join(root, 'lib', 'index.js'), 'utf8');
    rmSync(root, { recursive: true, force: true });

    expect(result.status).toBe(0);
    const runtime = JSON.parse(result.stdout) as {
      pluginConfigs: Array<Record<string, unknown>>;
      shellRegistrations: Array<Record<string, string>>;
    };
    expect(runtime.shellRegistrations).toHaveLength(1);
    expect(runtime.shellRegistrations[0].DSH_TAPTAP_MAKER_BIN).toMatch(
      /node_modules[\\/]@taptap[\\/]maker[\\/]bin[\\/]taptap-maker$/
    );
    expect(runtime.pluginConfigs).toHaveLength(2);
    expect(runtime.pluginConfigs[1].env).toEqual(
      expect.objectContaining({
        TAPTAP_MCP_CLIENT_IDE: 'dsh',
        TAPTAP_MAKER_DISTRIBUTION: 'dsh_plugin',
      })
    );
    expect(pluginSource).toContain("TAPTAP_MAKER_DISTRIBUTION: 'dsh_plugin'");
  });
});
