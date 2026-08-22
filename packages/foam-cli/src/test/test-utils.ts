import fs, { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { type ILogger, Logger } from '@foam/core';
import { loadWorkspaceFromDirectory } from '../support/filesystem';

Logger.setLevel('error');

export function createTmpDir(
  files: Record<string, string>,
  prefix = 'foam-test-'
): { rootDir: string; cleanup: () => void } {
  const rootDir = mkdtempSync(path.join(tmpdir(), prefix));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(rootDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  return {
    rootDir,
    cleanup: () => fs.rmSync(rootDir, { recursive: true, force: true }),
  };
}

export async function withTmpDir<T>(
  files: Record<string, string>,
  fn: (rootDir: string) => Promise<T>,
  prefix = 'foam-test-'
): Promise<T> {
  const { rootDir, cleanup } = createTmpDir(files, prefix);
  try {
    return await fn(rootDir);
  } finally {
    cleanup();
  }
}

async function createTmpWorkspace(
  files: Record<string, string>,
  prefix = 'foam-test-'
) {
  const { rootDir, cleanup } = createTmpDir(files, prefix);
  const result = await loadWorkspaceFromDirectory(rootDir);
  return { ...result, cleanup };
}

export async function withTmpWorkspace<T>(
  files: Record<string, string>,
  fn: (ctx: Awaited<ReturnType<typeof createTmpWorkspace>>) => Promise<T>,
  prefix = 'foam-test-'
): Promise<T> {
  const ctx = await createTmpWorkspace(files, prefix);
  try {
    return await fn(ctx);
  } finally {
    ctx.cleanup();
  }
}

export class TestLogger implements ILogger {
  logs: string[] = [];
  warnings: string[] = [];
  errors: string[] = [];

  debug() {}
  info(msg?: any) {
    this.logs.push(String(msg));
  }
  warn(msg?: any) {
    this.warnings.push(String(msg));
  }
  error(msg?: any) {
    this.errors.push(String(msg));
  }
  setLevel(_level: Parameters<ILogger['setLevel']>[0]) {}
}
