// Bundles the client and copies vendored assets (Stockfish WASM, chessground CSS) into public/.
import { build, context } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => path.join(root, ...a);
const watch = process.argv.includes('--watch');

await mkdir(p('public/vendor/stockfish'), { recursive: true });
// "Lite, single-threaded": ~3.5MB, works on any static host with no special headers.
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  await cp(p('node_modules/stockfish/bin', f), p('public/vendor/stockfish', f));
}
await cp(p('node_modules/chessground/assets/chessground.base.css'), p('public/vendor/chessground.base.css'));
await cp(p('node_modules/chessground/assets/chessground.cburnett.css'), p('public/vendor/chessground.cburnett.css'));

const opts = {
  entryPoints: [p('client/src/main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !watch,
  sourcemap: watch,
  outfile: p('public/app.js'),
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('watching client/src …');
} else {
  await build(opts);
}
