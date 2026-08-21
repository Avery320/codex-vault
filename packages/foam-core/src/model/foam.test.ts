import { bootstrap } from './foam';
import { Emitter } from '../common/event';
import { URI } from './uri';
import { IDataStore, IMatcher, IWatcher } from '../services/datastore';
import { ResourceParser } from './note';
import { ResourceProvider } from './provider';
import { createTestNote } from '../../test/test-utils';

class FakeWatcher implements IWatcher {
  private readonly changeEmitter = new Emitter<URI>();
  private readonly createEmitter = new Emitter<URI>();
  private readonly deleteEmitter = new Emitter<URI>();

  onDidChange = this.changeEmitter.event;
  onDidCreate = this.createEmitter.event;
  onDidDelete = this.deleteEmitter.event;

  fireCreate(uri: URI): void {
    this.createEmitter.fire(uri);
  }
}

class MarkdownMatcher implements IMatcher {
  calls = 0;

  isMatch(uri: URI): boolean {
    this.calls += 1;
    return uri.path.endsWith('.md');
  }
}

const dataStore: IDataStore = {
  list: async () => [],
  read: async () => null,
  write: async () => {},
  delete: async () => {},
  move: async () => {},
  exists: async () => false,
};

const parser: ResourceParser = {
  parse: () => {
    throw new Error('parser should not be called in these tests');
  },
};

const provider: ResourceProvider = {
  supports: () => true,
  readAsMarkdown: async () => null,
  fetch: async uri => createTestNote({ uri: uri.path }),
  resolveLink: () => {
    throw new Error('resolveLink should not be called in these tests');
  },
  dispose: () => {},
};

const waitForCreateBatch = () =>
  new Promise(resolve => setTimeout(resolve, 300));

async function bootstrapWithWatcher(matcher: IMatcher) {
  const watcher = new FakeWatcher();
  const foam = await bootstrap(
    [URI.file('/workspace')],
    matcher,
    watcher,
    dataStore,
    parser,
    [provider],
    '.md',
    'off'
  );
  return { watcher, foam };
}

describe('bootstrap file watching', () => {
  it('loads every matching file from a burst of create events', async () => {
    const matcher = new MarkdownMatcher();
    const { watcher, foam } = await bootstrapWithWatcher(matcher);
    const added: string[] = [];
    foam.workspace.onDidAdd(resource => added.push(resource.uri.path));

    try {
      watcher.fireCreate(URI.file('/workspace/note-a.md'));
      watcher.fireCreate(URI.file('/workspace/node_modules/pkg/index.js'));
      watcher.fireCreate(URI.file('/workspace/note-b.md'));

      await waitForCreateBatch();

      expect(added.sort()).toEqual([
        '/workspace/note-a.md',
        '/workspace/note-b.md',
      ]);
    } finally {
      foam.dispose();
    }
  });

  it('stops processing create events after disposal', async () => {
    const matcher = new MarkdownMatcher();
    const { watcher, foam } = await bootstrapWithWatcher(matcher);

    foam.dispose();
    watcher.fireCreate(URI.file('/workspace/late.md'));
    await waitForCreateBatch();

    expect(matcher.calls).toBe(0);
  });
});
