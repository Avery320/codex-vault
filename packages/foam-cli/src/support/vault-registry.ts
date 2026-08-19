import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface VaultRecord {
  id: string;
  name: string;
  path: string;
  last_opened_at: number;
}

interface VaultRegistryData {
  version: 1;
  active_vault_id?: string;
  vaults: VaultRecord[];
  project_vaults: Record<string, string>;
}

interface ObsidianRegistry {
  vaults?: Record<
    string,
    { path?: unknown; ts?: unknown; open?: unknown }
  >;
}

export interface VaultRegistryOptions {
  registryPath: string;
  obsidianRegistryPath?: string;
  legacyVaultPathFile?: string;
  now?: () => number;
  createId?: () => string;
}

const emptyRegistry = (): VaultRegistryData => ({
  version: 1,
  vaults: [],
  project_vaults: {},
});

export class VaultRegistry {
  private data: VaultRegistryData = emptyRegistry();
  private initialized = false;
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(private readonly options: VaultRegistryOptions) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? (() => randomBytes(8).toString('hex'));
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const loaded = await readJsonFile(this.options.registryPath);
    this.data = loaded ? parseRegistry(loaded) : emptyRegistry();
    let changed = loaded === null;

    const imported = await this.importObsidianVaults();
    changed = imported.changed || changed;
    changed = (await this.importLegacyVault()) || changed;

    const knownIds = new Set(this.data.vaults.map(vault => vault.id));
    for (const [projectPath, vaultId] of Object.entries(
      this.data.project_vaults
    )) {
      if (!knownIds.has(vaultId)) {
        delete this.data.project_vaults[projectPath];
        changed = true;
      }
    }

    if (
      this.data.active_vault_id &&
      !knownIds.has(this.data.active_vault_id)
    ) {
      delete this.data.active_vault_id;
      changed = true;
    }
    if (!this.data.active_vault_id && imported.activeId) {
      this.data.active_vault_id = imported.activeId;
      changed = true;
    }
    if (!this.data.active_vault_id && this.data.vaults.length > 0) {
      this.data.active_vault_id = [...this.data.vaults].sort(
        (left, right) => right.last_opened_at - left.last_opened_at
      )[0].id;
      changed = true;
    }

    this.initialized = true;
    if (changed) await this.save();
  }

  list(): VaultRecord[] {
    this.assertInitialized();
    return [...this.data.vaults]
      .sort((left, right) => right.last_opened_at - left.last_opened_at)
      .map(vault => ({ ...vault }));
  }

  getActive(): VaultRecord | null {
    this.assertInitialized();
    return this.find(this.data.active_vault_id);
  }

  get(vaultId: string): VaultRecord | null {
    this.assertInitialized();
    return this.find(vaultId);
  }

  async register(options: {
    vaultPath: string;
    name?: string;
    preferredId?: string;
    lastOpenedAt?: number;
    select?: boolean;
  }): Promise<VaultRecord> {
    this.assertInitialized();
    const result = await this.addDirectory(options);
    if (options.select) {
      this.data.active_vault_id = result.record.id;
      result.record.last_opened_at = this.now();
      result.changed = true;
    }
    if (result.changed) await this.save();
    return { ...result.record };
  }

  async create(parentPath: string, name: string): Promise<VaultRecord> {
    this.assertInitialized();
    const cleanName = validateVaultName(name);
    const canonicalParent = await canonicalDirectory(parentPath);
    const vaultPath = path.join(canonicalParent, cleanName);
    await fs.mkdir(vaultPath);
    await fs.mkdir(path.join(vaultPath, '.obsidian'));
    return this.register({
      vaultPath,
      name: cleanName,
      select: true,
    });
  }

  async select(vaultId: string): Promise<VaultRecord> {
    this.assertInitialized();
    const vault = this.find(vaultId);
    if (!vault) throw new Error(`Unknown vault: ${vaultId}`);
    vault.last_opened_at = this.now();
    this.data.active_vault_id = vault.id;
    await this.save();
    return { ...vault };
  }

  async forget(vaultId: string): Promise<void> {
    this.assertInitialized();
    if (!this.find(vaultId)) throw new Error(`Unknown vault: ${vaultId}`);

    this.data.vaults = this.data.vaults.filter(vault => vault.id !== vaultId);
    for (const [projectPath, mappedId] of Object.entries(
      this.data.project_vaults
    )) {
      if (mappedId === vaultId) delete this.data.project_vaults[projectPath];
    }
    if (this.data.active_vault_id === vaultId) {
      this.data.active_vault_id = this.data.vaults.length
        ? [...this.data.vaults].sort(
            (left, right) => right.last_opened_at - left.last_opened_at
          )[0].id
        : undefined;
    }
    await this.save();
  }

  async bindProject(projectPath: string, vaultId: string): Promise<void> {
    this.assertInitialized();
    if (!this.find(vaultId)) throw new Error(`Unknown vault: ${vaultId}`);
    const canonicalProject = await canonicalDirectory(projectPath);
    this.data.project_vaults[canonicalProject] = vaultId;
    await this.save();
  }

  async resolveProject(projectPath: string): Promise<VaultRecord | null> {
    this.assertInitialized();
    const canonicalProject = await canonicalDirectory(projectPath);
    const mappedId = this.data.project_vaults[canonicalProject];
    const mapped = this.find(mappedId);
    if (mapped) return { ...mapped };

    const containing = this.data.vaults
      .filter(vault => isWithin(canonicalProject, vault.path))
      .sort((left, right) => right.path.length - left.path.length)[0];
    return containing ? { ...containing } : null;
  }

  private async importObsidianVaults(): Promise<{
    activeId?: string;
    changed: boolean;
  }> {
    const registryPath = this.options.obsidianRegistryPath;
    if (!registryPath) return { changed: false };
    const raw = await readJsonFile(registryPath);
    if (!raw || typeof raw !== 'object') return { changed: false };

    let activeId: string | undefined;
    let changed = false;
    const vaults = (raw as ObsidianRegistry).vaults ?? {};
    for (const [id, entry] of Object.entries(vaults)) {
      if (typeof entry.path !== 'string') continue;
      try {
        const result = await this.addDirectory({
          vaultPath: entry.path,
          preferredId: id,
          lastOpenedAt:
            typeof entry.ts === 'number' ? entry.ts : this.now(),
        });
        changed = result.changed || changed;
        if (entry.open === true) activeId = result.record.id;
      } catch {
        // Obsidian keeps unavailable removable/cloud vaults in its registry.
        // Skip them without deleting or rewriting Obsidian's own data.
      }
    }
    return { activeId, changed };
  }

  private async importLegacyVault(): Promise<boolean> {
    const legacyPath = this.options.legacyVaultPathFile;
    if (!legacyPath) return false;
    let value: string;
    try {
      value = (await fs.readFile(legacyPath, 'utf8')).split(/\r?\n/, 1)[0].trim();
    } catch (error) {
      if (isMissingFile(error)) return false;
      throw error;
    }
    if (!value) return false;
    try {
      return (await this.addDirectory({ vaultPath: value })).changed;
    } catch {
      return false;
    }
  }

  private async addDirectory(options: {
    vaultPath: string;
    name?: string;
    preferredId?: string;
    lastOpenedAt?: number;
  }): Promise<{ record: VaultRecord; changed: boolean }> {
    const canonicalPath = await canonicalDirectory(options.vaultPath);
    const existing = this.data.vaults.find(
      vault => vault.path === canonicalPath
    );
    if (existing) return { record: existing, changed: false };

    const preferredId = options.preferredId?.trim();
    const id =
      preferredId && !this.data.vaults.some(vault => vault.id === preferredId)
        ? preferredId
        : this.createUniqueId();
    const record: VaultRecord = {
      id,
      name: options.name?.trim() || path.basename(canonicalPath),
      path: canonicalPath,
      last_opened_at: options.lastOpenedAt ?? this.now(),
    };
    this.data.vaults.push(record);
    return { record, changed: true };
  }

  private createUniqueId(): string {
    let id = this.createId();
    while (!id || this.data.vaults.some(vault => vault.id === id)) {
      id = this.createId();
    }
    return id;
  }

  private find(vaultId: string | undefined): VaultRecord | null {
    if (!vaultId) return null;
    return this.data.vaults.find(vault => vault.id === vaultId) ?? null;
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.options.registryPath), {
      recursive: true,
    });
    const temporaryPath = `${this.options.registryPath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(this.data, null, 2)}\n`,
      'utf8'
    );
    await fs.rename(temporaryPath, this.options.registryPath);
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('VaultRegistry.initialize() must be called first.');
    }
  }
}

async function canonicalDirectory(inputPath: string): Promise<string> {
  const resolved = path.resolve(inputPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${inputPath}`);
  return fs.realpath(resolved);
}

function isWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function validateVaultName(name: string): string {
  const clean = name.trim();
  if (
    !clean ||
    clean === '.' ||
    clean === '..' ||
    clean.includes('/') ||
    clean.includes('\\') ||
    clean.includes('\0')
  ) {
    throw new Error('Vault name must be a single non-empty folder name.');
  }
  return clean;
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function parseRegistry(value: unknown): VaultRegistryData {
  if (!value || typeof value !== 'object') {
    throw new Error('Codex Vault registry must be a JSON object.');
  }
  const candidate = value as Partial<VaultRegistryData>;
  if (candidate.version !== 1 || !Array.isArray(candidate.vaults)) {
    throw new Error('Unsupported Codex Vault registry format.');
  }
  const vaults = candidate.vaults.map(vault => {
    if (
      !vault ||
      typeof vault.id !== 'string' ||
      typeof vault.name !== 'string' ||
      typeof vault.path !== 'string' ||
      typeof vault.last_opened_at !== 'number'
    ) {
      throw new Error('Invalid vault entry in Codex Vault registry.');
    }
    return { ...vault };
  });
  const projectVaults = candidate.project_vaults;
  const validProjectVaults: Record<string, string> = {};
  if (projectVaults && typeof projectVaults === 'object') {
    for (const [projectPath, vaultId] of Object.entries(projectVaults)) {
      if (typeof vaultId === 'string') validProjectVaults[projectPath] = vaultId;
    }
  }
  return {
    version: 1,
    active_vault_id:
      typeof candidate.active_vault_id === 'string'
        ? candidate.active_vault_id
        : undefined,
    vaults,
    project_vaults: validProjectVaults,
  };
}

function isMissingFile(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
