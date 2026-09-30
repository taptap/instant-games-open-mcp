const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(name + '='))?.slice(name.length + 1);
const config = path.join(process.cwd(), '.project/validation-fixture.json');
const options = fs.existsSync(config) ? JSON.parse(fs.readFileSync(config, 'utf8')) : {};
if (args.includes('-screenshot-after-start')) process.exit(90);
const frame = Number(value('-screenshot-frame'));
if (frame >= 300 && Number(value('-validate-timeout')) < options.minRetryTimeout)
  options.reportTimeout = true;
fs.appendFileSync(
  path.join(process.cwd(), '.project/validation-launches.jsonl'),
  JSON.stringify({ frame, started: Date.now() }) + '\n'
);
console.log('runtime evidence');
if (options.logError) console.log('ERROR: Lua execution failed');
if (args.includes('-validate') && !options.noReport) {
  const pass = options.passReport && !options.luaErrors;
  fs.writeFileSync(
    value('-validate-output'),
    JSON.stringify({
      result: options.reportTimeout ? 'TIMEOUT' : pass ? 'PASS' : 'FAIL',
      frames_completed: Number(value('-validate-frames')),
      summary: {
        lua_errors: options.luaErrors || options.passWithLuaErrors ? 1 : 0,
        resource_errors: 0,
        engine_errors: pass ? 0 : 1,
        total_errors: pass ? 0 : options.luaErrors ? 2 : 1,
      },
      missing_resources: [],
      phases: { run: { errors: [{ message: 'Frame time spike: 101ms' }] } },
      test_result: value('-validate-test') && !options.ignoreTest ? 'PASSED' : 'NOT_RUN',
    })
  );
}
if (options.invalidReport) fs.writeFileSync(value('-validate-output'), '{"result":"PASS"}');
if (value('-screenshot') && !options.noPng) {
  const log = (at, text) => console.log(`[2026-09-30 12_00_00_000][${at}] INFO: ${text}`);
  const complete = () => {
    if (!options.bootstrapNever)
      log(
        options.bootstrapFrame ?? (options.requestBeforeBootstrap ? frame : 3),
        'BootstrapPipeline: completed successfully'
      );
  };
  if (!options.noBootstrapLog) {
    log(0, 'BootstrapPipeline: starting with 5 steps, total weight 1.00');
    if (options.requestBeforeBootstrap)
      log(frame, `[Screenshot] requested at frame ${frame} -> ${value('-screenshot')}`);
    if (options.arbitraryReady) console.log('Game ready: loading finished');
    if (
      options.requestBeforeBootstrap ||
      !options.bootstrapFrame ||
      options.bootstrapFrame <= frame
    )
      complete();
    log(frame, `[Screenshot] captured at frame ${frame} -> ${value('-screenshot')}`);
    if (!options.requestBeforeBootstrap && options.bootstrapFrame > frame) complete();
  }
  const png = new PNG({ width: 100, height: 100 });
  const blank =
    options.black || options.almostBlack || options.darkScene || frame < options.blackUntilFrame;
  for (let pixel = 0; pixel < 10000; pixel++) {
    const visible =
      !blank ||
      (options.almostBlack && pixel === 5000) ||
      (options.darkScene && pixel >= 5000 && pixel < 5200);
    png.data.set(
      [visible ? 80 : 0, visible ? 160 : 0, visible ? 200 : 0, options.transparent ? 0 : 255],
      pixel * 4
    );
  }
  const bytes = PNG.sync.write(png);
  if (options.corruptPng) bytes[bytes.length - 20] ^= 0xff;
  fs.writeFileSync(value('-screenshot'), bytes);
}
if (options.signal) {
  process.kill(process.pid, 'SIGTERM');
} else if (options.wait) {
  fs.writeFileSync(path.join(process.cwd(), '.project/validation-ready'), 'ready');
  setInterval(() => {}, 1000);
} else {
  process.exit(
    options.exitCode ??
      (args.includes('-validate') &&
      !options.invalidReport &&
      (!options.passReport || options.luaErrors || options.reportTimeout)
        ? 1
        : 0)
  );
}
