import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectDshLegacyMakerMcp,
  migrateDshLegacyMakerMcp,
  restoreDshLegacyMakerMcp,
} from '../maker/cli/dshPluginMigration';

const L1_CONFIG = `- insert:
    - id: mcp-taptap-maker
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: taptap-maker
        transport: stdio
        command: node
        args: ['/tmp/maker.js']
        toolCallTimeoutMs: 3600000
        failOnStartupError: true
`;

describe('DSH plugin migration', () => {
  let dshHome: string;
  let makerHome: string;

  beforeEach(() => {
    dshHome = mkdtempSync(join(tmpdir(), 'dsh-migration-'));
    makerHome = mkdtempSync(join(tmpdir(), 'dsh-maker-home-'));
    process.env.TAPTAP_MAKER_HOME = makerHome;
  });

  afterEach(() => {
    delete process.env.TAPTAP_MAKER_HOME;
  });

  function writeHomePatch(content: string) {
    writeFileSync(join(dshHome, 'cordis.patch.yml'), content, 'utf8');
  }

  it('inspects not_found when no config exists', () => {
    const result = inspectDshLegacyMakerMcp({ dshHome });
    expect(result.status).toBe('not_found');
    expect(result.registration_count).toBe(0);
  });

  it('migrates the whole registration (not just the id) and restores it', () => {
    writeHomePatch(L1_CONFIG);
    expect(inspectDshLegacyMakerMcp({ dshHome }).status).toBe('active');

    const migrated = migrateDshLegacyMakerMcp({ dshHome, confirm: true });
    expect(migrated.action).toBe('removed');
    expect(migrated.changed).toBe(true);
    const after = readFileSync(join(dshHome, 'cordis.patch.yml'), 'utf8');
    expect(after).not.toContain('mcp-taptap-maker');
    expect(after).not.toContain('@deepseek-ai/dsh-mcp-client');
    expect(inspectDshLegacyMakerMcp({ dshHome }).status).toBe('not_found');

    const restored = restoreDshLegacyMakerMcp({ dshHome, confirm: true });
    expect(restored.action).toBe('restored');
    expect(restored.changed).toBe(true);
    expect(inspectDshLegacyMakerMcp({ dshHome }).status).toBe('active');
  });

  it('removes only the Maker row and keeps other patches', () => {
    const other = `- id: other
  name: '@foo/bar'
`;
    writeHomePatch(`${other}${L1_CONFIG}`);
    migrateDshLegacyMakerMcp({ dshHome, confirm: true });
    const after = readFileSync(join(dshHome, 'cordis.patch.yml'), 'utf8');
    expect(after).toContain('@foo/bar');
    expect(after).not.toContain('mcp-taptap-maker');
  });

  it('detects ambiguous when home and profile both register', () => {
    writeHomePatch(L1_CONFIG);
    mkdirSync(join(dshHome, 'profiles', 'web'), { recursive: true });
    writeFileSync(join(dshHome, 'profiles', 'web', 'cordis.patch.yml'), L1_CONFIG, 'utf8');
    const result = inspectDshLegacyMakerMcp({ dshHome });
    expect(result.status).toBe('ambiguous');
    expect(result.registration_count).toBe(2);
  });

  it('requires confirmation for migrate', () => {
    writeHomePatch(L1_CONFIG);
    expect(() => migrateDshLegacyMakerMcp({ dshHome })).toThrow(/explicit confirmation/);
  });

  it('requires confirmation for restore after migration', () => {
    writeHomePatch(L1_CONFIG);
    migrateDshLegacyMakerMcp({ dshHome, confirm: true });
    expect(() => restoreDshLegacyMakerMcp({ dshHome })).toThrow(/explicit confirmation/);
  });
});
