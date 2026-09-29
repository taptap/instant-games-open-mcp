const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(name + '='))?.slice(name.length + 1);
const config = path.join(process.cwd(), '.project/validation-fixture.json');
const options = fs.existsSync(config) ? JSON.parse(fs.readFileSync(config, 'utf8')) : {};
if (args.includes('-screenshot-after-start')) process.exit(90);
console.log('runtime evidence');
if (args.includes('-validate') && !options.noReport) {
  fs.writeFileSync(
    value('-validate-output'),
    JSON.stringify({
      result: 'FAIL',
      frames_completed: Number(value('-validate-frames')),
      summary: { lua_errors: 0, resource_errors: 0, engine_errors: 1, total_errors: 1 },
      missing_resources: [],
      phases: { run: { errors: [{ message: 'Frame time spike: 101ms' }] } },
      test_result: value('-validate-test') && !options.ignoreTest ? 'PASSED' : 'NOT_RUN',
    })
  );
}
if (options.invalidReport) fs.writeFileSync(value('-validate-output'), '{"result":"PASS"}');
if (value('-screenshot') && !options.noPng) {
  fs.writeFileSync(
    value('-screenshot'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  );
}
if (options.signal) {
  process.kill(process.pid, 'SIGTERM');
} else if (options.wait) {
  fs.writeFileSync(path.join(process.cwd(), '.project/validation-ready'), 'ready');
  setInterval(() => {}, 1000);
} else {
  process.exit(args.includes('-validate') && !options.invalidReport ? 1 : 0);
}
