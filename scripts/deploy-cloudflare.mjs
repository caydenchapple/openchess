// Deploys OpenChess to Cloudflare: the room server (a Worker with a Durable Object) and the static site (Pages).
//   node scripts/deploy-cloudflare.mjs [--project openchess] [--skip-worker] [--worker-url wss://…]
// Needs `wrangler login` (or CLOUDFLARE_API_TOKEN). Online rooms work on the deployed site because dist/config.js points at the Worker.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const project = arg('project', 'openchess');
const run = (cmd, args, opts = {}) => {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], ...opts });
  process.stdout.write(r.stdout ?? '');
  if (r.status !== 0) { console.error(`failed: ${cmd}`); process.exit(r.status ?? 1); }
  return r.stdout ?? '';
};

run('npm', ['run', 'build:static']);

let workerUrl = arg('worker-url', '');
if (!process.argv.includes('--skip-worker')) {
  const out = run('npx', ['wrangler', 'deploy', '--config', 'worker/wrangler.toml']);
  const m = out.match(/https:\/\/[\w.-]+\.workers\.dev/);
  if (m) workerUrl = m[0].replace('https://', 'wss://');
  if (workerUrl) writeFileSync('worker/.deployed-url', workerUrl);
} else if (!workerUrl && existsSync('worker/.deployed-url')) workerUrl = readFileSync('worker/.deployed-url', 'utf8').trim();

if (workerUrl) {
  writeFileSync('dist/config.js', `// written by scripts/deploy-cloudflare.mjs\nwindow.OPENCHESS_SERVER = ${JSON.stringify(workerUrl)};\n`);
  console.log(`rooms server: ${workerUrl}`);
} else console.warn('No Worker URL: online rooms will be unavailable on the deployed site.');

run('npx', ['wrangler', 'pages', 'deploy', 'dist', '--project-name', project, '--branch', 'main', '--commit-dirty=true']);
