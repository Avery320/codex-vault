import { FoamWorkspace, IDisposable } from '@foam/core';

export interface VaultChangeWaitResult {
  revision: number;
  reset: boolean;
}

type Waiter = (result: VaultChangeWaitResult) => void;

/**
 * Converts workspace mutations into a race-free revision stream for MCP Apps.
 * A caller waits at its last observed revision; changes that happen before the
 * wait starts are detected immediately instead of being lost between requests.
 */
export class VaultChangeFeed implements IDisposable {
  private currentRevision = 0;
  private disposed = false;
  private readonly waiters = new Set<Waiter>();
  private readonly subscriptions: IDisposable[];

  constructor(workspace: FoamWorkspace) {
    const publish = () => this.publish();
    this.subscriptions = [
      workspace.onDidAdd(publish),
      workspace.onDidUpdate(publish),
      workspace.onDidDelete(publish),
    ];
  }

  get revision(): number {
    return this.currentRevision;
  }

  waitForChange(
    sinceRevision: number,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<VaultChangeWaitResult> {
    if (this.disposed || sinceRevision !== this.currentRevision) {
      return Promise.resolve({
        revision: this.currentRevision,
        reset: this.disposed || sinceRevision > this.currentRevision,
      });
    }

    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timeout);
        this.waiters.delete(finish);
        signal?.removeEventListener('abort', onAbort);
      };
      const finish: Waiter = result => {
        cleanup();
        resolve(result);
      };
      const onAbort = () => {
        cleanup();
        const error = new Error('Vault change wait aborted.');
        error.name = 'AbortError';
        reject(error);
      };

      timeout = setTimeout(
        () =>
          finish({
            revision: this.currentRevision,
            reset: false,
          }),
        timeoutMs
      );
      this.waiters.add(finish);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }

  private publish(): void {
    if (this.disposed) return;
    this.currentRevision += 1;
    const result: VaultChangeWaitResult = {
      revision: this.currentRevision,
      reset: false,
    };
    for (const finish of this.waiters) finish(result);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const subscription of this.subscriptions) subscription.dispose();
    const result: VaultChangeWaitResult = {
      revision: this.currentRevision,
      reset: true,
    };
    for (const finish of this.waiters) finish(result);
  }
}
