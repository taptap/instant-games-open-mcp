import { createRequire } from 'node:module';

const nodeRequire = createRequire(__filename);
const packageJson = nodeRequire('../../package.json');
const packageLock = nodeRequire('../../package-lock.json');

describe('main package manifest', () => {
  it('does not publish Maker CLI artifacts from the main npm package', () => {
    expect(packageJson.bin).not.toHaveProperty('taptap-maker');
    expect(packageJson.exports).not.toHaveProperty('./maker');
    expect(packageJson.files).not.toContain('dist/');
    expect(packageJson.files).not.toContain('bin/');
    expect(packageJson.files).not.toContain('skills/taptap-maker-local/');
    expect(packageJson.files).not.toContain('skills/taptap-maker-dev-kit-guide/');
    expect(packageJson.files).not.toContain('skills/update-taptap-mcp/');

    expect(packageLock.packages[''].bin).not.toHaveProperty('taptap-maker');
  });
});
