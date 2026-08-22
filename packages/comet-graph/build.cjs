const path = require('path');
const childProcess = require('child_process');
const esbuild = require('esbuild');

const dir = __dirname;
const packageOutDir = path.join(dir, 'out');
const production = process.argv.includes('--production');

async function buildLibTarget() {
  console.log('Building lib (ESM)...');
  await esbuild.build({
    entryPoints: [
      path.join(dir, 'src/comet-graph.ts'),
      path.join(dir, 'src/protocol.ts'),
    ],
    bundle: true,
    format: 'esm',
    outdir: packageOutDir,
    platform: 'browser',
    external: ['lit', 'lit/*', 'lit/decorators.js'],
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
  });
  buildDeclarations();
}

function buildDeclarations() {
  childProcess.execFileSync(
    process.execPath,
    [
      require.resolve('typescript/lib/tsc'),
      '-p',
      path.join(dir, 'tsconfig.build.json'),
    ],
    { stdio: 'inherit' }
  );
}

async function main() {
  await buildLibTarget();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
