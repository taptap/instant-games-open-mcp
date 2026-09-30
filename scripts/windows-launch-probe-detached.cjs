const { spawn } = require('node:child_process');
const [worker, directory, nonce] = process.argv.slice(2);
const child = spawn(process.execPath, [worker, directory, 'node-detached', nonce], {
  detached: true,
  windowsHide: true,
  stdio: 'ignore',
});
child.once('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.once('spawn', () => { console.log(child.pid); child.unref(); });
