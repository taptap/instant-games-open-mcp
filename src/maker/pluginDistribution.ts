export type MakerPluginDistributionId = 'codex_plugin' | 'workbuddy_plugin';

export type MakerPluginDistribution = {
  id: MakerPluginDistributionId;
  client: 'codex' | 'workbuddy';
  displayName: 'Codex' | 'WorkBuddy';
};

export function resolveMakerPluginDistribution(
  distribution: string | undefined = process.env.TAPTAP_MAKER_DISTRIBUTION
): MakerPluginDistribution | undefined {
  if (distribution === 'codex_plugin') {
    return { id: distribution, client: 'codex', displayName: 'Codex' };
  }
  if (distribution === 'workbuddy_plugin') {
    return { id: distribution, client: 'workbuddy', displayName: 'WorkBuddy' };
  }
  return undefined;
}

export function formatMakerPluginUpdateAction(distribution: MakerPluginDistribution): string {
  return `Update the installed ${distribution.displayName} plugin through its marketplace; do not install or upgrade the standalone npm package.`;
}
