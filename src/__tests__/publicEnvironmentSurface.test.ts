/**
 * Public MCP surfaces must not advertise internal service environments.
 */

import fs from 'node:fs';
import path from 'node:path';
import { appTools } from '../features/app/tools';

const INTERNAL_ENVIRONMENT_PATTERN = /\brnd\b|xdrnd|TAPTAP_MCP_ENV/iu;

describe('public MCP environment surface', () => {
  test('public tool definitions do not expose internal environment switching', () => {
    const toolNames = appTools.map((tool) => tool.definition.name);
    const definitions = JSON.stringify(appTools.map((tool) => tool.definition));

    expect(toolNames).not.toContain('get_environment_switch_guide');
    expect(definitions).not.toMatch(INTERNAL_ENVIRONMENT_PATTERN);
  });

  test('primary user documentation does not expose internal environments', () => {
    for (const file of [
      '.env.example',
      'AGENTS.md',
      'CLAUDE.md',
      'README.md',
      'docker/README.md',
      'docker/npm/docker-compose.yml',
      'docs/CI_CD.md',
      'docs/DEPLOYMENT.md',
      'docs/MCP_USAGE.md',
      'docs/PROXY.md',
      'skills/taptap-dc-ops-brief/SKILL.md',
    ]) {
      const text = fs.readFileSync(path.resolve(file), 'utf8');
      expect(text).not.toMatch(INTERNAL_ENVIRONMENT_PATTERN);
    }
  });
});
