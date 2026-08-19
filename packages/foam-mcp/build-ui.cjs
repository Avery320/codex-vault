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
  const script = result.outputFiles.find(file =>
    ['.js', '<stdout>'].some(suffix => file.path.endsWith(suffix))
  );
  if (!script) throw new Error('Vault explorer bundle was not generated.');

  const template = fs.readFileSync(
    path.join(packageDir, 'ui/vault-explorer.html'),
    'utf8'
  );
  const marker = '/*__CODEX_VAULT_BUNDLE__*/';
  if (!template.includes(marker)) {
    throw new Error(`Missing bundle marker ${marker}.`);
  }

  const outputDir = path.join(packageDir, 'out/ui');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'vault-explorer.html'),
    template.replace(marker, () => script.text)
  );
}

buildVaultExplorer().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
