const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.some((value) => value.startsWith('-maker-dev-'))) process.exit(91);
const gameUrl = args.find((value) => value.startsWith('-game_url='))?.slice('-game_url='.length);
const project = args
  .find((value) => value.startsWith('-tapcode_dir='))
  ?.split('=')
  .slice(1)
  .join('=');
async function main() {
  if ((!project && !gameUrl) || !args.includes('-skip_login')) process.exit(92);
  const localOptions = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), '.project', 'fixture.json'), 'utf8')
  );
  if (localOptions.exitEarly) process.exit(2);
  console.log('ARGS=' + JSON.stringify(args));
  let options;
  if (gameUrl) {
    if (project) process.exit(93);
    const latest = await (await fetch(gameUrl + 'latest.json')).json();
    const manifest = await (
      await fetch(gameUrl + latest.version + '/manifest-' + latest.client + '.json')
    ).json();
    const entry = manifest.files[0];
    console.log(
      await (await fetch(gameUrl + 'assets/' + entry.uuid + '-' + entry.hash + entry.ext)).text()
    );
    options = await (await fetch(gameUrl + 'project.json')).json();
    const cache = args
      .find((value) => value.startsWith('-game_path='))
      ?.slice('-game_path='.length);
    if (!cache) process.exit(96);
    const cacheDir = path.join(cache, gameUrl.replace('http://', '').replace(':', '_'));
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'downloaded.lua'), 'downloaded');
    fs.writeFileSync(path.join(cache, 'public-cache-marker'), 'retain');
    console.log('ASSET_ORIGIN=' + new URL(gameUrl).origin);
  } else {
    if (args[0] !== 'main.lua') process.exit(94);
    console.log(fs.readFileSync(path.join(project, 'scripts', args[0]), 'utf8'));
    options = JSON.parse(fs.readFileSync(path.join(project, '.project', 'fixture.json'), 'utf8'));
  }
  if (options.exitEarly) process.exit(2);
  if (options.error) console.error('ERROR: fixture Lua failure');
  setInterval(() => {}, 1000);
}
main().catch((error) => {
  console.error(error);
  process.exit(95);
});
