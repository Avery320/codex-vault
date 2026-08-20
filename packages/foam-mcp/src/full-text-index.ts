import MiniSearch, { SearchResult } from 'minisearch';
import type {
  FoamWorkspace,
  IDataStore,
  Resource,
  SearchMatch,
} from '@foam/core';

interface IndexedResource {
  id: string;
  title: string;
  aliases: string;
  tags: string;
  properties: string;
  body: string;
}

interface CachedResource {
  resource: Resource;
  content: string;
}

const CJK_CHARACTER =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

/**
 * Tokenizes Latin text on word boundaries and adds overlapping CJK tokens.
 *
 * `Intl.Segmenter` understands Chinese word boundaries, while the additional
 * characters and bigrams keep partial note searches useful even when the
 * runtime dictionary segments a phrase differently from the author.
 */
function tokenizeVaultText(text: string): string[] {
  const tokens = new Set<string>();
  const normalized = text.normalize('NFKC').toLocaleLowerCase();

  for (const item of segmenter.segment(normalized)) {
    if (!item.isWordLike) continue;
    const word = item.segment.trim();
    if (!word) continue;

    tokens.add(word);
    if (CJK_CHARACTER.test(word)) {
      const characters = Array.from(word);
      characters.forEach(character => tokens.add(character));
      for (let index = 0; index < characters.length - 1; index += 1) {
        tokens.add(characters[index] + characters[index + 1]);
      }
    }
  }

  return Array.from(tokens);
}

/**
 * A local, incremental full-text index over the Markdown resources in a Foam
 * workspace. The index stays in process and never sends vault content away.
 */
export class VaultFullTextIndex {
  private readonly index = new MiniSearch<IndexedResource>({
    fields: ['title', 'aliases', 'tags', 'properties', 'body'],
    storeFields: [],
    tokenize: tokenizeVaultText,
  });
  private readonly cache = new Map<string, CachedResource>();
  private readonly subscriptions: Array<{ dispose(): void }>;
  private readonly initialized: Promise<void>;
  private pendingUpdates = Promise.resolve();

  constructor(
    private readonly workspace: FoamWorkspace,
    private readonly dataStore: IDataStore
  ) {
    this.subscriptions = [
      workspace.onDidAdd(resource => this.enqueueUpsert(resource)),
      workspace.onDidUpdate(({ new: resource }) =>
        this.enqueueUpsert(resource)
      ),
      workspace.onDidDelete(resource => this.enqueueDelete(resource)),
    ];
    this.initialized = this.buildInitialIndex();
  }

  async search(query: string, limit = 20): Promise<SearchMatch[]> {
    await this.initialized;
    await this.pendingUpdates;

    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const results = this.index.search(trimmedQuery, {
      boost: { title: 5, aliases: 4, tags: 3, properties: 2, body: 1 },
      combineWith: 'AND',
      prefix: term => term.length >= 3 && !CJK_CHARACTER.test(term),
      fuzzy: term =>
        term.length >= 5 && !CJK_CHARACTER.test(term) ? 0.2 : false,
    });

    return results
      .slice(0, limit)
      .map(result => this.toSearchMatch(result, trimmedQuery))
      .filter((match): match is SearchMatch => match !== null);
  }

  dispose(): void {
    this.subscriptions.forEach(subscription => subscription.dispose());
  }

  private async buildInitialIndex(): Promise<void> {
    const resources = this.workspace
      .list()
      .filter(resource => resource.type === 'note');
    const batchSize = 64;

    for (let offset = 0; offset < resources.length; offset += batchSize) {
      const documents = await Promise.all(
        resources
          .slice(offset, offset + batchSize)
          .map(resource => this.readDocument(resource))
      );
      for (const document of documents) {
        if (!document) continue;
        this.index.add(document.indexed);
        this.cache.set(document.indexed.id, document.cached);
      }
    }
  }

  private enqueueUpsert(resource: Resource): void {
    this.pendingUpdates = this.pendingUpdates.then(async () => {
      await this.initialized;
      const document = await this.readDocument(resource);
      if (!document) {
        this.remove(resource);
        return;
      }

      if (this.cache.has(document.indexed.id)) {
        this.index.replace(document.indexed);
      } else {
        this.index.add(document.indexed);
      }
      this.cache.set(document.indexed.id, document.cached);
    });
  }

  private enqueueDelete(resource: Resource): void {
    this.pendingUpdates = this.pendingUpdates.then(async () => {
      await this.initialized;
      this.remove(resource);
    });
  }

  private remove(resource: Resource): void {
    const id = resource.uri.toString();
    if (this.cache.has(id)) {
      this.index.discard(id);
      this.cache.delete(id);
    }
  }

  private async readDocument(resource: Resource): Promise<{
    indexed: IndexedResource;
    cached: CachedResource;
  } | null> {
    if (resource.type !== 'note') return null;
    const content = await this.dataStore.read(resource.uri);
    if (content === null) return null;

    return {
      indexed: {
        id: resource.uri.toString(),
        title: resource.title,
        aliases: resource.aliases.map(alias => alias.title).join(' '),
        tags: resource.tags.map(tag => tag.label).join(' '),
        properties: JSON.stringify(resource.properties),
        body: content,
      },
      cached: { resource, content },
    };
  }

  private toSearchMatch(
    result: SearchResult,
    query: string
  ): SearchMatch | null {
    const cached = this.cache.get(String(result.id));
    if (!cached) return null;
    const { resource, content } = cached;
    const location = findMatchingLine(content, query, result.terms);

    return {
      id: this.workspace.getIdentifier(resource.uri),
      uri: resource.uri,
      title: resource.title,
      type: resource.type,
      tags: resource.tags.map(tag => tag.label),
      properties: resource.properties as Record<string, unknown>,
      line: location.line,
      text: location.text,
    };
  }
}

function findMatchingLine(
  content: string,
  query: string,
  matchedTerms: string[]
): { line: number; text: string } {
  const lines = content.split(/\r?\n/);
  const queryLower = query.toLocaleLowerCase();
  const exactIndex = lines.findIndex(line =>
    line.toLocaleLowerCase().includes(queryLower)
  );
  if (exactIndex >= 0) {
    return { line: exactIndex + 1, text: lines[exactIndex] };
  }

  const terms = matchedTerms
    .map(term => term.toLocaleLowerCase())
    .sort((left, right) => right.length - left.length);
  const termIndex = lines.findIndex(line => {
    const lower = line.toLocaleLowerCase();
    return terms.some(term => lower.includes(term));
  });
  if (termIndex >= 0) {
    return { line: termIndex + 1, text: lines[termIndex] };
  }

  const heading = lines.find(line => /^#\s+/.test(line.trim()));
  return {
    line: 1,
    text: heading?.trim() ?? '# ',
  };
}
