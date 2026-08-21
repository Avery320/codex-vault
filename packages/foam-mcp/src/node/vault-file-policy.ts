import { IMatcher, URI } from '@foam/core';

export const VAULT_NOTE_EXTENSIONS = ['.md'];
export const VAULT_DEFAULT_NOTE_EXTENSION = '.md';
export const VAULT_EXCLUDED_DIRECTORY_NAMES = [
  '.astro',
  '.git',
  '.obsidian',
  '.trash',
  '.yarn',
  'node_modules',
];

/**
 * The single path policy used by the initial vault scan and filesystem watcher.
 * Resource providers remain responsible for deciding which file extensions they
 * can read.
 */
export class VaultFilePolicy implements IMatcher {
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
}
