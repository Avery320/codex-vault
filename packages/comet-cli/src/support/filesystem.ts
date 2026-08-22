import fs from 'node:fs/promises';
import path from 'node:path';

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
} from '@comet/core';
import {
  VAULT_DEFAULT_NOTE_EXTENSION,
  VAULT_NOTE_EXTENSIONS,
  VaultFilePolicy,
} from '@comet/mcp';

export class NodeFileDataStore implements IDataStore {
  constructor(
    private readonly rootDir: string,
    private readonly matcher: IMatcher,
    private readonly isPathIgnored: (fsPath: string) => boolean = () => false
  ) {}

  async list(): Promise<URI[]> {
    const files: string[] = [];
    await collectFiles(this.rootDir, files, this.isPathIgnored);
    return files.map(URI.file).filter(uri => this.matcher.isMatch(uri));
  }

  async read(uri: URI): Promise<string | null> {
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
    const { default: trash } = await import('trash');
    await trash(uri.toFsPath(), { glob: false });
  }

  async move(from: URI, to: URI): Promise<void> {
    const destination = to.toFsPath();
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(from.toFsPath(), destination);
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
  directory: string,
  files: string[],
  isPathIgnored: (fsPath: string) => boolean
): Promise<void> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!isPathIgnored(filePath)) {
        await collectFiles(filePath, files, isPathIgnored);
      }
    } else {
      files.push(filePath);
    }
  }
}

export interface LoadWorkspaceOptions {
  filePolicy?: VaultFilePolicy;
  watcher?: IWatcher;
}

export async function loadWorkspaceFromDirectory(
  workspaceDir: string,
  options: LoadWorkspaceOptions = {}
) {
  const rootDir = path.resolve(workspaceDir);
  const rootUri = URI.file(rootDir);
  const filePolicy = options.filePolicy ?? new VaultFilePolicy();
  const dataStore = new NodeFileDataStore(rootDir, filePolicy, filePath =>
    filePolicy.isIgnored(filePath)
  );
  const parser = createMarkdownParser();
  const providers = [
    new MarkdownResourceProvider(dataStore, parser, VAULT_NOTE_EXTENSIONS),
    new AttachmentResourceProvider(defaultAttachmentExtensions),
  ];

  const comet = await bootstrap(
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
    workspace: comet.workspace,
    comet,
    dataStore,
  };
}
