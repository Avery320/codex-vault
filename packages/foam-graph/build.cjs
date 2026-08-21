const path = require('path');
const fs = require('fs');
const childProcess = require('child_process');
const esbuild = require('esbuild');

const dir = __dirname;
const packageOutDir = path.join(dir, 'out');
const production = process.argv.includes('--production');

async function buildLibTarget() {
  console.log('Building lib (ESM)...');
  await esbuild.build({
    entryPoints: [
      path.join(dir, 'src/foam-graph.ts'),
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
  writeComponentEntrypointDeclaration();
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

function writeComponentEntrypointDeclaration() {
  // tsconfig.build.json intentionally emits declarations only for protocol.ts.
  // Full declaration emit for the Lit component currently exposes unrelated
  // internal graph typing issues, so keep the public component entrypoint as a
  // minimal side-effect import declaration.
  fs.writeFileSync(
    path.join(packageOutDir, 'foam-graph.d.ts'),
    [
      "declare global {",
      "  interface HTMLElementTagNameMap {",
      "    'foam-graph': HTMLElement;",
      "  }",
      "}",
      "export {};",
      "",
    ].join('\n')
  );
}

async function main() {
  await buildLibTarget();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
