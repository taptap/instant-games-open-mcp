export type MakerPluginDistributionId = 'codex_plugin' | 'workbuddy_plugin' | 'dsh_plugin';

export type MakerPluginDistribution = {
  id: MakerPluginDistributionId;
  client: 'codex' | 'workbuddy' | 'dsh';
  displayName: 'Codex' | 'WorkBuddy' | 'DSH';
};

export function hasMakerPluginDistribution(
  distribution: string | undefined = process.env.TAPTAP_MAKER_DISTRIBUTION
): boolean {
  return Boolean(distribution?.trim());
}

export function resolveMakerPluginDistribution(
  distribution: string | undefined = process.env.TAPTAP_MAKER_DISTRIBUTION
): MakerPluginDistribution | undefined {
  if (distribution === 'codex_plugin') {
    return { id: distribution, client: 'codex', displayName: 'Codex' };
  }
  if (distribution === 'workbuddy_plugin') {
    return { id: distribution, client: 'workbuddy', displayName: 'WorkBuddy' };
  }
  if (distribution === 'dsh_plugin') {
    return { id: distribution, client: 'dsh', displayName: 'DSH' };
  }
  return undefined;
}

export function formatMakerPluginUpdateAction(distribution: MakerPluginDistribution): string {
  if (distribution.client === 'dsh') {
    return (
      'Update the installed DSH plugin via `dsh plugin --profile <profile> update ' +
      '@taptap/dsh-maker`; do not install or upgrade the standalone npm package.'
    );
  }
  return `Update the installed ${distribution.displayName} plugin through its marketplace; do not install or upgrade the standalone npm package.`;
}
