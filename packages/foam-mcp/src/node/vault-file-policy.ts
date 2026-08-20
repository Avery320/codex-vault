import { IMatcher, URI } from '@foam/core';

export const VAULT_NOTE_EXTENSIONS = ['.md'];
export const VAULT_DEFAULT_NOTE_EXTENSION = '.md';
export const VAULT_EXCLUDED_DIRECTORY_NAMES = [
  '.git',
  '.obsidian',
  '.trash',
  'node_modules',
];

/**
 * The single path policy used by the initial vault scan and filesystem watcher.
 * Resource providers remain responsible for deciding which file extensions they
 * can read.
 */
export class VaultFilePolicy implements IMatcher {
  readonly include = ['**/*'];
  readonly exclude = VAULT_EXCLUDED_DIRECTORY_NAMES.map(
    name => `**/${name}/**`
  );

  private readonly excludedDirectoryNames = new Set(
    VAULT_EXCLUDED_DIRECTORY_NAMES
  );
  isIgnored(fsPath: string): boolean {
    return fsPath
      .split(/[\\/]+/)
      .some(segment => this.excludedDirectoryNames.has(segment));
  }

  isMatch(uri: URI): boolean {
    return !this.isIgnored(uri.toFsPath());
  }

  match(files: URI[]): URI[] {
    return files.filter(uri => this.isMatch(uri));
  }

  async refresh(): Promise<void> {}
}
