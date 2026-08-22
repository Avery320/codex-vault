import { URI } from '../model/uri';
import { Event } from '../common/event';

export interface IDataStore {
  list(): Promise<URI[]>;
  read(uri: URI): Promise<string | null>;
  write(uri: URI, content: string): Promise<void>;
  delete(uri: URI): Promise<void>;
  move(from: URI, to: URI): Promise<void>;
  exists(uri: URI): Promise<boolean>;
}

export interface IWatcher {
  onDidChange: Event<URI>;
  onDidCreate: Event<URI>;
  onDidDelete: Event<URI>;
}

export interface IMatcher {
  isMatch(uri: URI): boolean;
}
