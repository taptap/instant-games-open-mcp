import clientModelModule from '../src/maker/clientModel/index.js';

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--expect-model' || !args[1].trim())) {
  console.error('Usage: npm run test:maker:model -- [--expect-model <model-id>]');
  process.exitCode = 2;
} else {
  const expected = args[1];
  const startedAt = performance.now();
  const model = await clientModelModule.resolveMakerClientModel({ projectDir: process.cwd() });
  const matches = expected === undefined ? null : model.client_model_id === expected;
  console.log(
    JSON.stringify(
      {
        status: matches === false ? 'MISMATCH' : model.client_model_id ? 'DETECTED' : 'UNAVAILABLE',
        elapsed_ms: Math.round(performance.now() - startedAt),
        model,
        expected_model: expected ?? null,
        matches_expected: matches,
      },
      null,
      2
    )
  );
  if (matches === false) process.exitCode = 1;
}
