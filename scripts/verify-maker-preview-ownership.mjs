import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

const bundle = path.resolve(process.argv[2] || 'dist/maker.js');
const installationFile = process.argv[3];
if (!installationFile)
  throw new Error(
    'Usage: node scripts/verify-maker-preview-ownership.mjs <bundle> <installation.json|--fresh-install> [--direct]'
  );
const root = path.resolve('.maker', 'direct-preview-' + randomUUID());
const home = path.join(root, 'home');
const project = path.join(root, "preview \u6e38\u620f O'Brian & test");
const env = { ...process.env, TAPTAP_MAKER_HOME: home };
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function json(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(value));
}
if (installationFile !== '--fresh-install')
  json(
    path.join(home, 'runtime', 'installation.json'),
    JSON.parse(fs.readFileSync(installationFile, 'utf8'))
  );
json(path.join(project, '.maker-mcp', 'config.json'), { project_id: 'ownership-smoke' });
if (process.argv.includes('--direct'))
  for (const name of ['project', 'resources', 'settings'])
    json(path.join(project, '.project', name + '.json'), {});
fs.mkdirSync(path.join(project, 'scripts'));
fs.mkdirSync(path.join(project, 'assets'));
fs.writeFileSync(
  path.join(project, 'scripts', 'main.lua'),
  'function Start()\n graphics.windowTitle = "Maker ownership smoke"\n print("MAKER_OWNERSHIP_READY")\nend\n'
);
const evidence = { root, node: process.version, uv: process.versions.uv, scenarios: [] };
const children = new Set();
function launch(args) {
  const child = spawn(process.execPath, [bundle, ...args], {
    env,
    shell: false,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', (data) => {
    output.stdout += data;
  });
  child.stderr.on('data', (data) => {
    output.stderr += data;
  });
  const closed = once(child, 'close').then(([code]) => {
    children.delete(child);
    return code;
  });
  return { child, output, closed };
}
async function cli(args) {
  const run = launch([...args, '--json']);
  const code = await run.closed;
  if (!run.output.stdout.trim()) throw new Error('CLI returned no JSON: ' + run.output.stderr);
  return { ...JSON.parse(run.output.stdout), cli_exit_code: code };
}
const preview = (action, extra = []) => cli(['preview', action, '--target-dir', project, ...extra]);
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}
function windowEvidence(pid) {
  if (process.platform !== 'win32') return { verified: false };
  assert.equal(Number.isSafeInteger(pid) && pid > 0, true);
  const probe = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '$process = Get-Process -Id ' +
        pid +
        '; @{ handle = $process.MainWindowHandle.ToInt64(); title = $process.MainWindowTitle } | ConvertTo-Json -Compress',
    ],
    { encoding: 'utf8', timeout: 10000, windowsHide: true, shell: false }
  );
  assert.equal(probe.status, 0, probe.stderr);
  const window = JSON.parse(probe.stdout.trim());
  assert.notEqual(window.handle, 0);
  assert.equal(window.title, 'Maker ownership smoke');
  return window;
}
async function waitFor(read, predicate, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await delay(200);
  }
  throw new Error('Timed out waiting for preview evidence.');
}
function consoleRecord() {
  const filename = path.join(home, 'console', 'session.json');
  return fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : undefined;
}
async function shutdownConsole() {
  const record = consoleRecord();
  if (!record || !alive(record.pid)) return;
  await preview('stop');
  await delay(1200);
  await cli(['console', 'stop']);
  await waitFor(
    () => alive(record.pid),
    (value) => !value
  );
}
try {
  if (installationFile === '--fresh-install') {
    console.log('Checking fresh Runtime installation and reuse...');
    const installed = await preview('install');
    assert.equal(installed.ok, true, JSON.stringify(installed));
    const repeated = await preview('install');
    assert.equal(repeated.ok, true, JSON.stringify(repeated));
    assert.equal(repeated.executable, installed.executable);
    assert.equal(repeated.installed_at, installed.installed_at);
    assert.equal(repeated.archive_sha256, installed.archive_sha256);
    evidence.scenarios.push({ name: 'fresh-install-and-reuse', executable: installed.executable });
  }
  console.log('Checking Agent ownership, logs and stop...');
  const agent = launch([
    'preview',
    'run',
    '--target-dir',
    project,
    '--duration-ms',
    '600000',
    '--json',
  ]);
  const running = await waitFor(
    () => preview('status'),
    (value) => value.state === 'running'
  );
  assert.equal(running.supervisor_pid, agent.child.pid);
  await waitFor(
    () => preview('logs', ['--limit', '500']),
    (value) => JSON.stringify(value).includes('MAKER_OWNERSHIP_READY')
  );
  const agentWindow = windowEvidence(running.runtime_pid);
  const competing = await preview('run', ['--duration-ms', '1000']);
  assert.equal(competing.ok, false, JSON.stringify(competing));
  assert.equal(alive(running.runtime_pid), true);
  const wrongSession = await preview('stop', ['--session-id', randomUUID()]);
  assert.equal(wrongSession.ok, false, JSON.stringify(wrongSession));
  assert.equal((await preview('status')).session_id, running.session_id);
  assert.equal(alive(running.runtime_pid), true);
  evidence.scenarios.push({ name: 'competing-agent-and-wrong-session-cannot-stop-owner' });
  assert.equal((await preview('stop', ['--session-id', running.session_id])).process_alive, false);
  await agent.closed;
  assert.equal(alive(running.runtime_pid), false);
  evidence.scenarios.push({
    name: 'agent-direct-logs-and-explicit-stop',
    owner: agent.child.pid,
    runtime: running.runtime_pid,
    window: agentWindow,
  });
  console.log('Checking forced Agent exit...');

  const killedAgent = launch([
    'preview',
    'run',
    '--target-dir',
    project,
    '--duration-ms',
    '600000',
    '--json',
  ]);
  const owned = await waitFor(
    () => preview('status'),
    (value) => value.state === 'running'
  );
  assert.equal(owned.supervisor_pid, killedAgent.child.pid);
  killedAgent.child.kill();
  await killedAgent.closed;
  await waitFor(
    () => alive(owned.runtime_pid),
    (value) => !value
  );
  evidence.scenarios.push({
    name: 'agent-owner-forced-exit-cleans-runtime',
    runtime: owned.runtime_pid,
  });
  console.log('Checking automatic console launch, refresh and stop...');

  const user = await preview('start');
  assert.equal(user.ok, true, JSON.stringify(user));
  assert.equal(user.supervisor_pid, consoleRecord().pid);
  await delay(1500);
  assert.equal(alive(user.runtime_pid), true);
  const shutdownWhileActive = launch(['console', 'stop', '--json']);
  assert.notEqual(await shutdownWhileActive.closed, 0);
  assert.match(shutdownWhileActive.output.stderr, /Stop the active preview/);
  assert.equal(alive(user.runtime_pid), true);
  evidence.scenarios.push({ name: 'console-shutdown-refuses-active-preview' });
  for (const headers of [
    { Origin: 'https://foreign.invalid', 'Content-Type': 'application/json' },
    { 'Content-Type': 'application/json' },
    {
      Origin: consoleRecord().origin,
      'Sec-Fetch-Site': 'cross-site',
      'Content-Type': 'application/json',
    },
  ]) {
    const rejected = await fetch(consoleRecord().origin + '/api/shutdown', {
      method: 'POST',
      headers,
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(rejected.status, 403);
    await rejected.text();
  }
  assert.equal(alive(user.runtime_pid), true);
  evidence.scenarios.push({ name: 'console-rejects-foreign-and-missing-origin-writes' });
  const refreshed = await preview('refresh');
  assert.equal(refreshed.ok, true, JSON.stringify(refreshed));
  assert.notEqual(refreshed.runtime_pid, user.runtime_pid);
  assert.equal(alive(user.runtime_pid), false);
  assert.equal((await preview('stop')).process_alive, false);
  await waitFor(
    () => alive(refreshed.runtime_pid),
    (value) => !value
  );
  evidence.scenarios.push({
    name: 'auto-console-survives-client-exit-refresh-stop',
    owner: user.supervisor_pid,
  });
  await shutdownConsole();
  console.log('Checking forced console exit and recovery...');

  const host = launch(['console', 'serve']);
  await waitFor(
    () => consoleRecord(),
    (value) => value?.pid === host.child.pid
  );
  const hosted = await preview('start');
  assert.equal(hosted.ok, true, JSON.stringify(hosted));
  assert.equal(hosted.supervisor_pid, host.child.pid);
  host.child.kill();
  await host.closed;
  await waitFor(
    () => alive(hosted.runtime_pid),
    (value) => !value
  );
  evidence.scenarios.push({
    name: 'console-owner-forced-exit-cleans-runtime',
    owner: host.child.pid,
    runtime: hosted.runtime_pid,
  });
  const recovered = await preview('start');
  assert.equal(recovered.ok, true, JSON.stringify(recovered));
  assert.notEqual(recovered.session_id, hosted.session_id);
  assert.equal((await preview('stop')).process_alive, false);
  evidence.scenarios.push({ name: 'restart-after-owner-crash' });
  evidence.ok = true;
} catch (error) {
  evidence.ok = false;
  evidence.error = String(error);
  process.exitCode = 1;
} finally {
  await shutdownConsole().catch((error) => {
    evidence.cleanup_error = String(error);
    process.exitCode = 1;
  });
  for (const child of children) child.kill();
  json(path.join(root, 'evidence.json'), evidence);
  console.log(JSON.stringify(evidence, null, 2));
}
