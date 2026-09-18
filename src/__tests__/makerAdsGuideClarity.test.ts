import { formatMakerAdsIntegrationGuide } from '../maker/server/adIntegrationGuide';
import { getMakerRemoteProxyPublicDescriptionOverride } from '../maker/server/toolDescriptions';

describe('Maker ads workflow boundaries', () => {
  it('starts with the full workflow and keeps project identity explicit', () => {
    const guide = formatMakerAdsIntegrationGuide();
    expect(guide).toContain('Workflow:');
    expect(guide.indexOf('Workflow:')).toBeLessThan(guide.indexOf('1.'));
    expect(guide).toContain('same target_dir');
    expect(guide).toContain('does not bind or switch');
  });
  it('distinguishes remote success from local readiness with a concrete stop condition', () => {
    const guide = formatMakerAdsIntegrationGuide();
    expect(guide).toContain('settings_path');
    expect(guide).toContain('does not write');
    expect(guide).toContain('synced_at');
    expect(guide).toContain('pause ad implementation/testing');
    expect(guide).toContain('Do not copy another project');
    expect(guide).toContain('real-device');
  });
  it('exposes the remote/local boundary in the tool entry point too', () => {
    const description = getMakerRemoteProxyPublicDescriptionOverride('get_ad_config')!;
    expect(description).toContain('remote workspace');
    expect(description).toContain('does not write');
    expect(description).toContain('target_dir');
  });
});
