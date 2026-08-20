import fs from 'node:fs/promises';
import path from 'node:path';
import micromatch from 'micromatch';

import {
  URI,
  AttachmentResourceProvider,
  defaultAttachmentExtensions,
  IDataStore,
  IMatcher,
  IWatcher,
  createMarkdownParser,
  MarkdownResourceProvider,
  bootstrap,
} from '@foam/core';
import {
  VAULT_DEFAULT_NOTE_EXTENSION,
  VAULT_NOTE_EXTENSIONS,
  VaultFilePolicy,
} from '@foam/mcp';

const isWithinPath = (candidate: string, parent: string) => {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
};

export class NodeFileDataStore implements IDataStore {
  constructor(
    private readonly rootDir: string,
    private readonly excludedPaths: string[],
    private readonly matcher: IMatcher,
    private readonly isPathIgnored: (fsPath: string) => boolean = () => false
  ) {}

  async list(pattern?: string) {
    const files: string[] = [];
    await collectFiles(
      this.rootDir,
      files,
      this.excludedPaths,
      this.isPathIgnored
    );
    let uris = files.map(file => URI.file(file));
    if (pattern) {
      const absoluteGlob = path.posix.join(this.rootDir, pattern);
      const matched = micromatch(
        uris.map(u => u.toFsPath()),
        [absoluteGlob]
      );
      const matchedSet = new Set(matched);
      uris = uris.filter(u => matchedSet.has(u.toFsPath()));
    }
    return uris.filter(uri => this.matcher.isMatch(uri));
  }

  async read(uri: URI) {
    try {
      return await fs.readFile(uri.toFsPath(), 'utf8');
    } catch {
      return null;
    }
  }

  async write(uri: URI, content: string): Promise<void> {
    const fsPath = uri.toFsPath();
    await fs.mkdir(path.dirname(fsPath), { recursive: true });
    await fs.writeFile(fsPath, content, 'utf8');
  }

  async delete(uri: URI): Promise<void> {
    try {
      await fs.unlink(uri.toFsPath());
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async move(from: URI, to: URI): Promise<void> {
    const toFs = to.toFsPath();
    await fs.mkdir(path.dirname(toFs), { recursive: true });
    await fs.rename(from.toFsPath(), toFs);
  }

  async exists(uri: URI): Promise<boolean> {
    try {
      await fs.access(uri.toFsPath());
      return true;
    } catch {
      return false;
    }
  }
}

async function collectFiles(
  dir: string,
  files: string[],
  excludedPaths: string[],
  isPathIgnored: (fsPath: string) => boolean
) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (
      excludedPaths.some(excludedPath => isWithinPath(fullPath, excludedPath))
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      if (isPathIgnored(fullPath)) {
        continue;
      }

      await collectFiles(fullPath, files, excludedPaths, isPathIgnored);
      continue;
    }

    files.push(fullPath);
  }
}

export interface LoadWorkspaceOptions {
  excludedPaths?: string[];
  filePolicy?: VaultFilePolicy;
}

export async function loadWorkspaceFromDirectory(
  workspaceDir: string,
  options: LoadWorkspaceOptions & {
    /**
     * Optional watcher to keep the in-memory graph in sync with on-disk
     * changes. Used by long-running consumers (e.g. the MCP server). One-shot
     * commands (most CLI subcommands) leave this undefined and read a snapshot.
     */
    watcher?: IWatcher;
  } = {}
) {
  const rootDir = path.resolve(workspaceDir);
  const rootUri = URI.file(rootDir);
  const filePolicy = options.filePolicy ?? new VaultFilePolicy();

  const dataStore = new NodeFileDataStore(
    rootDir,
    [
      ...new Set(
        (options.excludedPaths ?? []).map(excludedPath =>
          path.resolve(excludedPath)
        )
      ),
    ],
    filePolicy,
    fsPath => filePolicy.isIgnored(fsPath)
  );

  const parser = createMarkdownParser();
  const providers = [
    new MarkdownResourceProvider(dataStore, parser, VAULT_NOTE_EXTENSIONS),
    new AttachmentResourceProvider(defaultAttachmentExtensions),
  ];

  const foam = await bootstrap(
    [rootUri],
    filePolicy,
    options.watcher,
    dataStore,
    parser,
    providers,
    VAULT_DEFAULT_NOTE_EXTENSION,
    options.watcher ? 'info' : 'debug'
  );

  return {
    rootDir,
    rootUri,
    workspace: foam.workspace,
    foam,
    dataStore,
  };
}
