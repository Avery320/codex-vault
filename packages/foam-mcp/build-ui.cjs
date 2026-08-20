const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

async function buildVaultExplorer() {
  const packageDir = __dirname;
  const result = await esbuild.build({
    entryPoints: [path.join(packageDir, 'ui/vault-explorer.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    legalComments: 'none',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });
  const [script] = result.outputFiles;
  if (!script) throw new Error('Vault explorer bundle was not generated.');

  const template = fs.readFileSync(
    path.join(packageDir, 'ui/vault-explorer.html'),
    'utf8'
  );
  const style = fs.readFileSync(
    path.join(packageDir, 'ui/vault-explorer.css'),
    'utf8'
  );
  const scriptMarker = '/*__CODEX_VAULT_BUNDLE__*/';
  const styleMarker = '/*__CODEX_VAULT_STYLE__*/';
  for (const marker of [scriptMarker, styleMarker]) {
    if (!template.includes(marker)) {
      throw new Error(`Missing bundle marker ${marker}.`);
    }
  }

  const outputDir = path.join(packageDir, 'out/ui');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'vault-explorer.html'),
    template
      .replace(styleMarker, () => style)
      .replace(scriptMarker, () => script.text)
  );
}

buildVaultExplorer().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
