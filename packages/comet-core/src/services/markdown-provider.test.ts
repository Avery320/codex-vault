import {
  createTestNote,
  createTestWorkspace,
  getRandomURI,
} from '../../test/test-utils';
import { CometGraph } from '../model/graph';
import { URI } from '../model/uri';
import { createMarkdownParser } from './markdown-parser';

const parser = createMarkdownParser();
const createNoteFromMarkdown = (content: string, path?: string) =>
  parser.parse(path ? URI.file(path) : getRandomURI(), content);

describe('Obsidian link resolution', () => {
  it('resolves basename, relative, and suffix-path wikilinks', () => {
    const source = createNoteFromMarkdown(
      '[[page b]] [[../two/page c]] [[zoo/page d]]',
      '/root/one/source.md'
    );
    const targets = [
      createTestNote({ uri: '/elsewhere/page b.md' }),
      createTestNote({ uri: '/root/two/page c.md' }),
      createTestNote({ uri: '/root/zoo/page d.md' }),
    ];
    const workspace = createTestWorkspace().set(source);
    targets.forEach(target => workspace.set(target));

    expect(
      source.links.map(link => workspace.resolveLink(source, link).path)
    ).toEqual(targets.map(target => target.uri.path));
  });

  it('uses an explicit suffix path to disambiguate notes', () => {
    const source = createTestNote({
      uri: '/source.md',
      links: [{ slug: 'folder/page' }],
    });
    const other = createTestNote({ uri: '/other/page.md' });
    const intended = createTestNote({ uri: '/folder/page.md' });
    const workspace = createTestWorkspace()
      .set(source)
      .set(other)
      .set(intended);

    expect(workspace.resolveLink(source, source.links[0])).toEqual(
      intended.uri
    );
  });

  it('uses resolved wikilink definitions and their fragments', () => {
    const source = createTestNote({
      uri: '/vault/from/source.md',
      links: [
        { slug: 'display name', definitionUrl: '../to/target.md#section' },
      ],
    });
    const target = createTestNote({ uri: '/vault/to/target.md' });
    const workspace = createTestWorkspace().set(source).set(target);

    expect(workspace.resolveLink(source, source.links[0])).toEqual(
      target.uri.with({ fragment: 'section' })
    );
  });

  it('resolves wikilinks case-insensitively', () => {
    const source = createTestNote({
      uri: '/source.md',
      links: [{ slug: 'page-b' }],
    });
    const target = createTestNote({ uri: '/notes/PAGE-B.md' });
    const workspace = createTestWorkspace().set(source).set(target);

    expect(workspace.resolveLink(source, source.links[0])).toEqual(target.uri);
  });

  it('preserves target and self-section fragments', () => {
    const source = createTestNote({
      uri: '/source.md',
      links: [{ slug: 'target#Section' }, { slug: '#Local' }],
    });
    const target = createTestNote({ uri: '/target.md' });
    const workspace = createTestWorkspace().set(source).set(target);

    expect(workspace.resolveLink(source, source.links[0])).toEqual(
      target.uri.with({ fragment: 'Section' })
    );
    expect(workspace.resolveLink(source, source.links[1])).toEqual(
      source.uri.with({ fragment: 'Local' })
    );
  });

  it('resolves common special characters in wikilink filenames', () => {
    const source = createNoteFromMarkdown(
      '[[page: a]] [[page %b%]] [[page {c}]]',
      '/source.md'
    );
    const targets = ['page: a.md', 'page %b%.md', 'page {c}.md'].map(name =>
      createTestNote({ uri: `/notes/${name}` })
    );
    const workspace = createTestWorkspace().set(source);
    targets.forEach(target => workspace.set(target));

    expect(
      source.links.map(link => workspace.resolveLink(source, link).path)
    ).toEqual(targets.map(target => target.uri.path));
  });

  it('resolves absolute and relative Markdown links', () => {
    const source = createTestNote({
      uri: '/path/source.md',
      links: [{ to: '/path/absolute.md' }, { to: './nested/relative.md' }],
    });
    const absolute = createTestNote({ uri: '/path/absolute.md' });
    const relative = createTestNote({ uri: '/path/nested/relative.md' });
    const workspace = createTestWorkspace()
      .set(source)
      .set(absolute)
      .set(relative);

    expect(workspace.resolveLink(source, source.links[0])).toEqual(
      absolute.uri
    );
    expect(workspace.resolveLink(source, source.links[1])).toEqual(
      relative.uri
    );
  });

  it('resolves angle-bracket Markdown links containing spaces', () => {
    const target = createNoteFromMarkdown('Target', '/path/note a.md');
    const source = createNoteFromMarkdown(
      '[note](<./note a.md>)',
      '/path/source.md'
    );
    const workspace = createTestWorkspace().set(source).set(target);

    expect(workspace.resolveLink(source, source.links[0])).toEqual(target.uri);
  });

  it('resolves root-relative links and fragments inside a Vault root', () => {
    const source = createTestNote({
      uri: '/vault/notes/source.md',
      links: [{ to: '/docs/target.md#Section' }],
    });
    const target = createTestNote({ uri: '/vault/docs/target.md' });
    const workspace = createTestWorkspace([URI.file('/vault')])
      .set(source)
      .set(target);

    expect(workspace.resolveLink(source, source.links[0])).toEqual(
      target.uri.with({ fragment: 'Section' })
    );
  });

  it('finds root-relative links in later workspace roots', () => {
    const source = createTestNote({
      uri: '/vault-a/source.md',
      links: [{ to: '/shared/target.md' }],
    });
    const target = createTestNote({ uri: '/vault-b/shared/target.md' });
    const workspace = createTestWorkspace([
      URI.file('/vault-a'),
      URI.file('/vault-b'),
    ])
      .set(source)
      .set(target);

    expect(workspace.resolveLink(source, source.links[0])).toEqual(target.uri);
  });

  it('creates a contained placeholder for a missing root-relative link', () => {
    const source = createTestNote({
      uri: '/vault/source.md',
      links: [{ to: '/missing/note.md' }],
    });
    const workspace = createTestWorkspace([URI.file('/vault')]).set(source);
    const result = workspace.resolveLink(source, source.links[0]);

    expect(result.isPlaceholder()).toBe(true);
    expect(result.path).toBe('/vault/missing/note.md');
  });
});

describe('Obsidian directory notes', () => {
  it('resolves wikilinks to index, README, or a preferred direct file', () => {
    const source = createTestNote({
      uri: '/source.md',
      links: [{ slug: 'foo' }, { slug: 'bar' }, { slug: 'baz' }],
    });
    const targets = [
      createTestNote({ uri: '/foo/index.md' }),
      createTestNote({ uri: '/bar/README.md' }),
      createTestNote({ uri: '/baz.md' }),
    ];
    const workspace = createTestWorkspace().set(source);
    targets.forEach(target => workspace.set(target));
    workspace.set(createTestNote({ uri: '/baz/index.md' }));

    expect(
      source.links.map(link => workspace.resolveLink(source, link).path)
    ).toEqual(targets.map(target => target.uri.path));
  });

  it('preserves fragments on directory wikilinks', () => {
    const source = createTestNote({
      uri: '/source.md',
      links: [{ slug: 'topic#Section' }],
    });
    const index = createTestNote({ uri: '/topic/index.md' });
    const workspace = createTestWorkspace().set(source).set(index);

    expect(workspace.resolveLink(source, source.links[0])).toEqual(
      index.uri.with({ fragment: 'Section' })
    );
  });

  it('resolves direct directory links with or without a trailing slash', () => {
    const source = createTestNote({
      uri: '/source.md',
      links: [{ to: 'topic' }, { to: 'topic/' }],
    });
    const index = createTestNote({ uri: '/topic/index.md' });
    const workspace = createTestWorkspace().set(source).set(index);

    for (const link of source.links) {
      expect(workspace.resolveLink(source, link)).toEqual(index.uri);
    }
  });

  it('can disable directory-note resolution for both link syntaxes', () => {
    const source = createTestNote({
      uri: '/source.md',
      links: [{ slug: 'topic' }, { to: 'topic' }],
    });
    const workspace = createTestWorkspace([], undefined, 'disabled')
      .set(source)
      .set(createTestNote({ uri: '/topic/index.md' }));

    for (const link of source.links) {
      expect(workspace.resolveLink(source, link).isPlaceholder()).toBe(true);
    }
  });
});

describe('Obsidian block links', () => {
  it('preserves target and self block-anchor fragments', () => {
    const source = createNoteFromMarkdown(
      '[[target#^block-id]] [[#^local-id]]',
      '/source.md'
    );
    const target = createNoteFromMarkdown(
      'Target paragraph ^block-id',
      '/target.md'
    );
    const workspace = createTestWorkspace().set(source).set(target);

    expect(workspace.resolveLink(source, source.links[0])).toEqual(
      target.uri.with({ fragment: '^block-id' })
    );
    expect(workspace.resolveLink(source, source.links[1])).toEqual(
      source.uri.with({ fragment: '^local-id' })
    );
  });
});

describe('external links', () => {
  it('resolves inline and reference-style external links as external URIs', () => {
    const source = createNoteFromMarkdown(
      '[OpenAI](https://openai.com) [Docs][docs]\n\n[docs]: http://example.com/docs',
      '/source.md'
    );
    const workspace = createTestWorkspace().set(source);

    expect(
      source.links.map(link => workspace.resolveLink(source, link).scheme)
    ).toEqual(['https', 'http']);
  });

  it('excludes external links from the knowledge graph', () => {
    const source = createNoteFromMarkdown(
      '[OpenAI](https://openai.com) [[target]]',
      '/source.md'
    );
    const target = createTestNote({ uri: '/target.md' });
    const workspace = createTestWorkspace().set(source).set(target);
    const graph = CometGraph.fromWorkspace(workspace);

    expect(graph.getLinks(source.uri).map(link => link.target.path)).toEqual([
      target.uri.path,
    ]);
    expect(graph.placeholders.size).toBe(0);
  });
});
