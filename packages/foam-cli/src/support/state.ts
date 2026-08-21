import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getUserConfigDir } from './user-config';

export type ConsentEventState = 'tty' | 'user';

export interface FoamState {
  installationId?: string;
  consentEventFired?: ConsentEventState;
}

class StateStore {
  getPath(): string {
    return path.join(getUserConfigDir(), 'state.json');
  }

  read(): FoamState {
    try {
      return JSON.parse(fs.readFileSync(this.getPath(), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  patch(patch: Partial<FoamState>): void {
    const next = { ...this.read(), ...patch };
    const statePath = this.getPath();
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(`${statePath}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
    fs.renameSync(`${statePath}.tmp`, statePath);
  }

  getOrCreateInstallationId(): { id: string; isNew: boolean } {
    const current = this.read().installationId;
    if (current) return { id: current, isNew: false };
    const id = crypto.randomUUID();
    this.patch({ installationId: id });
    return { id, isNew: true };
  }
}

export const State = new StateStore();
