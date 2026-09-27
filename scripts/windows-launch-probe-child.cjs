const fs = require('node:fs');
const path = require('node:path');
const [directory, mode, nonce] = process.argv.slice(2);
if (!directory || !mode || !nonce) process.exit(2);
const started = Date.now();
const heartbeat = () => {
  fs.writeFileSync(path.join(directory, mode + '.json'), JSON.stringify({ pid: process.pid, ppid: process.ppid, nonce, at: Date.now() }));
  if (Date.now() - started >= 90000) process.exit(0);
};
heartbeat();
setInterval(heartbeat, 1000);
