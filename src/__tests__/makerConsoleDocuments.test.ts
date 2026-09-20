import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConsoleDocuments } from '../maker/console/documents';
import { formatMakerAdsIntegrationGuide } from '../maker/server/adIntegrationGuide';

describe('console document directory', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-documents-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  function write(name: string, content: string) {
    const filename = path.join(root, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
  }
  it('lists bundled and project documents separately from skills', () => {
    write('package/docs/MAKER_CONSOLE.md', '# Console');
    write('project/README.md', '# Game');
    write('project/engine-docs/api.md', '# Engine API');
    write('project/.installer/skills/walk/SKILL.md', '---\nname: walk\n---\n# Walking\n\n**Move**');
    write('project/.secret-plan.md', '# Secret');
    const docs = new ConsoleDocuments(path.join(root, 'package'));
    const entries = docs.list(path.join(root, 'project'));
    expect(entries.map((item) => item.title)).toEqual([
      '广告接入与激励奖励',
      'Console',
      'Game',
      'Engine API',
      'Walking',
    ]);
    expect(entries.find((item) => item.title === 'Game')?.kind).toBe('project');
    expect(entries.find((item) => item.title === 'Engine API')?.kind).toBe('docs');
    expect(entries.find((item) => item.title === 'Console')?.kind).toBe('docs');
    const skill = entries.find((item) => item.kind === 'skills')!;
    expect(docs.read(skill.id, path.join(root, 'project')).tokens).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'heading', text: 'Walking' })])
    );
    expect(docs.read(skill.id, path.join(root, 'project')).link).toBe(
      fs.realpathSync(path.join(root, 'project/.installer/skills/walk/SKILL.md'))
    );
    expect(docs.list()).toHaveLength(2);
  });
  it('rejects arbitrary paths, cross-project ids and external symlinks', () => {
    write('package/docs/MAKER_CONSOLE.md', '# Console');
    write('one/docs/one.md', '# First');
    write('two/docs/two.md', '# Second');
    fs.symlinkSync(path.join(root, 'two/docs/two.md'), path.join(root, 'one/docs/external.md'));
    const docs = new ConsoleDocuments(path.join(root, 'package'));
    const items = docs.list(path.join(root, 'one'));
    expect(items).toHaveLength(3);
    const id = items.find((item) => item.source === '当前项目')!.id;
    expect(() => docs.read(id, path.join(root, 'two'))).toThrow();
    expect(() => docs.read('../../secret')).toThrow();
  });
  it('keeps raw HTML as tokens rather than trusted rendered HTML', () => {
    write('project/docs/test.md', '<script>alert(1)</script>\n\n[bad](javascript:alert(1))');
    const docs = new ConsoleDocuments(path.join(root, 'package'));
    const item = docs.list(path.join(root, 'project')).find((entry) => entry.kind === 'project')!;
    const result = docs.read(item.id, path.join(root, 'project'));
    expect(result).not.toHaveProperty('html');
    expect(Array.isArray(result.tokens)).toBe(true);
  });
  it('reuses the MCP ads source and links only installed project skills', () => {
    const docs = new ConsoleDocuments(path.join(root, 'package'));
    expect(docs.read('maker-ads-integration-guide').content).toBe(formatMakerAdsIntegrationGuide());
    expect(docs.read('maker-ads-integration-guide').link).toBe('maker://ads-integration-guide');
    expect(docs.list()[0].related).toEqual([]);
    write('project/engine-docs/recipes/sdk.md', '# SDK');
    write('project/.installer/skills/setup-ads/SKILL.md', '# Original ads');
    write('project/engine-docs/recipes/client-cloud-score.md', '# Original cloud');
    write('project/engine-docs/recipes/network-game-guide.md', '# Original network');
    const items = docs.list(path.join(root, 'project'));
    const ads = items[0];
    const skill = items.find((item) => item.kind === 'skills')!;
    expect(ads.related).toContain(skill.id);
    expect(skill).toMatchObject({
      title: '广告接入 Skill',
      featured: true,
      category: '常用 Skill',
    });
    expect(items.find((item) => item.title === '云存档与排行榜')?.featured).toBe(true);
    expect(items.find((item) => item.title === '多人联机')?.featured).toBe(true);
    expect(docs.read(skill.id, path.join(root, 'project')).content).toBe('# Original ads');
    expect(docs.list().some((item) => item.kind === 'skills')).toBe(false);
  });
});
