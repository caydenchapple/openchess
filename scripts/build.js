// Bundles the client and copies vendored assets (Stockfish WASM, chessground CSS) into public/.
import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
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

// self-hosted fonts (Geist, the shadcn/ui default): nothing is loaded from a third party
await mkdir(p('public/fonts'), { recursive: true });
for (const [pkg, files] of [['geist', ['geist-latin-wght-normal.woff2', 'geist-latin-ext-wght-normal.woff2']], ['geist-mono', ['geist-mono-latin-wght-normal.woff2', 'geist-mono-latin-ext-wght-normal.woff2']]]) {
  for (const f of files) await cp(p('node_modules/@fontsource-variable', pkg, 'files', f), p('public/fonts', f));
}

await rm(p('public/chunks'), { recursive: true, force: true });

const opts = {
  entryPoints: [p('client/src/main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !watch,
  sourcemap: watch,
  splitting: true, // screens are loaded on demand
  outdir: p('public'),
  entryNames: 'app',
  chunkNames: 'chunks/[name]-[hash]',
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('watching client/src …');
} else {
  await build(opts);
  // esbuild writes a copy of the shared CSS next to each chunk; only app.css is linked, so drop the copies
  const { readdir, unlink } = await import('node:fs/promises');
  for (const f of await readdir(p('public/chunks'))) if (f.endsWith('.css')) await unlink(p('public/chunks', f));
}
