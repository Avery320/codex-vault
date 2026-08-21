import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { VaultFilePolicy } from '@foam/mcp';
import { withTmpWorkspace } from '../test/test-utils';
import { loadWorkspaceFromDirectory, NodeFileDataStore } from './filesystem';

function createTmpDir(files: Record<string, string>): {
  rootDir: string;
  cleanup: () => void;
} {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'foam-datastore-test-'));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(rootDir, name);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }
  return {
    rootDir,
    cleanup: () => rmSync(rootDir, { recursive: true, force: true }),
  };
}

describe('NodeFileDataStore', () => {
  it('returns all files when no globs are configured', async () => {
    const { rootDir, cleanup } = createTmpDir({
      'note.md': '# Note',
      'sub/other.md': '# Other',
    });
    try {
      const policy = new VaultFilePolicy();
      const store = new NodeFileDataStore(rootDir, policy, fsPath =>
        policy.isIgnored(fsPath)
      );
      const uris = await store.list();
      const paths = uris.map(u => u.toFsPath());
      expect(paths.some(p => p.endsWith('note.md'))).toBe(true);
      expect(paths.some(p => p.endsWith('other.md'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('excludes directories defined by the vault policy', async () => {
    const { rootDir, cleanup } = createTmpDir({
      'note.md': '# Note',
      '.trash/wip.md': '# WIP',
      '.obsidian/plugins/readme.md': '# Plugin',
    });
    try {
      const store = new NodeFileDataStore(rootDir, new VaultFilePolicy());
      const uris = await store.list();
      const paths = uris.map(u => u.toFsPath());
      expect(paths.some(p => p.endsWith('note.md'))).toBe(true);
      expect(paths.every(p => !p.includes('.trash'))).toBe(true);
      expect(paths.every(p => !p.includes('.obsidian'))).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('loadWorkspaceFromDirectory', () => {
  it('excludes every generated or private directory in the vault policy', async () => {
    await withTmpWorkspace(
      {
        'note.md': '# Note',
        '.git/note.md': '# In git',
        '.obsidian/note.md': '# In Obsidian metadata',
        '.trash/note.md': '# In trash',
        'node_modules/pkg/readme.md': '# Pkg',
        '.astro/note.md': '# In Astro output',
        '.yarn/note.md': '# In yarn',
      },
      async ({ workspace }) => {
        const uris = workspace.list().map(r => r.uri.toFsPath());
        expect(uris.some(u => u.endsWith('note.md'))).toBe(true);
        expect(uris.every(u => !u.includes('.git'))).toBe(true);
        expect(uris.every(u => !u.includes('.obsidian'))).toBe(true);
        expect(uris.every(u => !u.includes('.trash'))).toBe(true);
        expect(uris.every(u => !u.includes('node_modules'))).toBe(true);
        expect(uris.every(u => !u.includes('.astro'))).toBe(true);
        expect(uris.every(u => !u.includes('.yarn'))).toBe(true);
      }
    );
  });

  it('does not let .vscode settings change the vault index policy', async () => {
    await withTmpWorkspace(
      {
        '.vscode/settings.json': JSON.stringify({
          'foam.files.defaultNoteExtension': 'mdx',
          'foam.files.exclude': ['hidden/**'],
        }),
        'note.mdx': '# MDX Note',
        'note.md': '# Markdown Note',
        'hidden/still-visible.md': '# Still visible',
      },
      async ({ workspace }) => {
        const uris = workspace.list().map(r => r.uri.toFsPath());
        expect(uris.every(u => !u.endsWith('note.mdx'))).toBe(true);
        expect(uris.some(u => u.endsWith('note.md'))).toBe(true);
        expect(uris.some(u => u.endsWith('still-visible.md'))).toBe(true);
      }
    );
  });

  it('loads Markdown when .vscode/settings.json is absent', async () => {
    await withTmpWorkspace({ 'note.md': '# Note' }, async ({ workspace }) => {
      const uris = workspace.list().map(r => r.uri.toFsPath());
      expect(uris.some(u => u.endsWith('note.md'))).toBe(true);
    });
  });
});
