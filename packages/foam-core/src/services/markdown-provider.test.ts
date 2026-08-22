import { createMarkdownParser } from './markdown-parser';
import { Logger } from '../utils/log';
import { URI } from '../model/uri';
import { FoamGraph } from '../model/graph';
import {
  createTestNote,
  createTestWorkspace,
  getRandomURI,
} from '../../test/test-utils';

Logger.setLevel('error');

const parser = createMarkdownParser([]);
const createNoteFromMarkdown = (content: string, path?: string) =>
  parser.parse(path ? URI.file(path) : getRandomURI(), content);

describe('Link resolution', () => {
  describe('Wikilinks', () => {
    it('should resolve basename wikilinks with files in same directory', () => {
      const workspace = createTestWorkspace();
      const noteA = createNoteFromMarkdown('Link to [[page b]]', './page-a.md');
      const noteB = createNoteFromMarkdown('Content of page b', './page b.md');
      workspace.set(noteA).set(noteB);
      expect(workspace.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
    });

    it('should resolve basename wikilinks with files in other directory', () => {
      const workspace = createTestWorkspace();
      const noteA = createNoteFromMarkdown('Link to [[page b]]', './page-a.md');
      const noteB = createNoteFromMarkdown('Page b', './folder/page b.md');
      workspace.set(noteA).set(noteB);
      expect(workspace.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
    });

    it('should resolve wikilinks that represent an absolute path', () => {
      const workspace = createTestWorkspace();
      const noteA = createNoteFromMarkdown(
        'Link to [[/folder/page b]]',
        '/page-a.md'
      );
      const noteB = createNoteFromMarkdown('Page b', '/folder/page b.md');
      workspace.set(noteA).set(noteB);
      expect(workspace.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
    });

    it('should resolve wikilinks that represent a relative path', () => {
      const workspace = createTestWorkspace();
      const noteA = createNoteFromMarkdown(
        'Link to [[../two/page b]]',
        '/path/one/page-a.md'
      );
      const noteB = createNoteFromMarkdown('Page b', '/path/one/page b.md');
      const noteB2 = createNoteFromMarkdown('Page b 2', '/path/two/page b.md');
      workspace.set(noteA).set(noteB).set(noteB2);
      expect(workspace.resolveLink(noteA, noteA.links[0])).toEqual(noteB2.uri);
    });

    it('should resolve ambiguous wikilinks', () => {
      const workspace = createTestWorkspace();
      const noteA = createNoteFromMarkdown('Link to [[page b]]', '/page-a.md');
      const noteB = createNoteFromMarkdown('Page b', '/path/one/page b.md');
      const noteB2 = createNoteFromMarkdown('Page b2', '/path/two/page b.md');
      workspace.set(noteA).set(noteB).set(noteB2);
      expect(workspace.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
    });

    it('should resolve path wikilink even with other ambiguous notes', () => {
      const noteA = createTestNote({
        uri: '/path/to/page-a.md',
        links: [{ slug: './more/page-b' }, { slug: 'yet/page-b' }],
      });
      const noteB1 = createTestNote({ uri: '/path/to/another/page-b.md' });
      const noteB2 = createTestNote({ uri: '/path/to/more/page-b.md' });
      const noteB3 = createTestNote({ uri: '/path/to/yet/page-b.md' });

      const ws = createTestWorkspace();
      ws.set(noteA).set(noteB1).set(noteB2).set(noteB3);

      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB2.uri);
      expect(ws.resolveLink(noteA, noteA.links[1])).toEqual(noteB3.uri);
    });

    it('should resolve Foam wikilinks', () => {
      const workspace = createTestWorkspace();
      const noteA = createNoteFromMarkdown(
        'Link to [[two/page b]] and [[one/page b]]',
        '/page-a.md'
      );
      const noteB = createNoteFromMarkdown('Page b', '/path/one/page b.md');
      const noteB2 = createNoteFromMarkdown('Page b2', '/path/two/page b.md');
      workspace.set(noteA).set(noteB).set(noteB2);
      expect(workspace.resolveLink(noteA, noteA.links[0])).toEqual(noteB2.uri);
      expect(workspace.resolveLink(noteA, noteA.links[1])).toEqual(noteB.uri);
    });

    it('should use wikilink definitions when available to resolve target', () => {
      const ws = createTestWorkspace();
      const noteA = createTestNote({
        uri: '/somewhere/from/page-a.md',
        links: [{ slug: 'page-b', definitionUrl: '../to/page-b.md' }],
      });
      const noteB = createTestNote({
        uri: '/somewhere/to/page-b.md',
      });
      ws.set(noteA).set(noteB);
      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
    });

    it('should include section fragment from a resolved wikilink definition when rawText has no section', () => {
      const ws = createTestWorkspace();
      const noteA = createTestNote({
        uri: '/somewhere/from/page-a.md',
        links: [{ slug: 'page-b', definitionUrl: '../to/page-b.md#mysection' }],
      });
      const noteB = createTestNote({ uri: '/somewhere/to/page-b.md' });
      ws.set(noteA).set(noteB);
      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(
        noteB.uri.with({ fragment: 'mysection' })
      );
    });

    it('should support case insensitive wikilink resolution', () => {
      const noteA = createTestNote({
        uri: '/path/to/page-a.md',
        links: [
          // uppercased filename, lowercased slug
          { slug: 'page-b' },
          // lowercased filename, camelcased wikilink
          { slug: 'Page-C' },
          // lowercased filename, lowercased wikilink
          { slug: 'page-d' },
        ],
      });
      const noteB = createTestNote({ uri: '/somewhere/PAGE-B.md' });
      const noteC = createTestNote({ uri: '/path/another/page-c.md' });
      const noteD = createTestNote({ uri: '/path/another/page-d.md' });
      const ws = createTestWorkspace()
        .set(noteA)
        .set(noteB)
        .set(noteC)
        .set(noteD);

      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
      expect(ws.resolveLink(noteA, noteA.links[1])).toEqual(noteC.uri);
      expect(ws.resolveLink(noteA, noteA.links[2])).toEqual(noteD.uri);
    });

    it('should resolve wikilink with section identifier', () => {
      const noteA = createTestNote({
        uri: '/path/to/page-a.md',
        links: [
          // uppercased filename, lowercased slug
          { slug: 'page-b#section' },
        ],
      });
      const noteB = createTestNote({ uri: '/somewhere/PAGE-B.md' });
      const ws = createTestWorkspace().set(noteA).set(noteB);

      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(
        noteB.uri.with({ fragment: 'section' })
      );
    });

    it('should resolve section-only wikilinks', () => {
      const noteA = createTestNote({
        uri: '/path/to/page-a.md',
        links: [
          // uppercased filename, lowercased slug
          { slug: '#section' },
        ],
      });
      const ws = createTestWorkspace().set(noteA);

      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(
        noteA.uri.with({ fragment: 'section' })
      );
    });

    it('should resolve wikilinks with special characters', () => {
      const ws = createTestWorkspace();
      const noteA = createNoteFromMarkdown(
        `Link to [[page: a]] and [[page %b%]] and [[page? c]] and [[[page] d]] and
         [[page ^e^]] and [[page \`f\`]] and [[page {g}]] and [[page ~i]] and
         [[page /j]]`
      );
      const noteB = createNoteFromMarkdown(
        'Note containing :',
        '/dir1/page: a.md'
      );
      const noteC = createNoteFromMarkdown(
        'Note containing %',
        '/dir1/page %b%.md'
      );
      const noteD = createNoteFromMarkdown(
        'Note containing ?',
        '/dir1/page? c.md'
      );
      const noteE = createNoteFromMarkdown(
        'Note containing ]',
        '/dir1/[page] d.md'
      );
      const noteF = createNoteFromMarkdown(
        'Note containing ^',
        '/dir1/page ^e^.md'
      );
      const noteG = createNoteFromMarkdown(
        'Note containing `',
        '/dir1/page `f`.md'
      );
      const noteH = createNoteFromMarkdown(
        'Note containing { and }',
        '/dir1/page {g}.md'
      );
      const noteI = createNoteFromMarkdown(
        'Note containing ~',
        '/dir1/page ~i.md'
      );
      ws.set(noteA)
        .set(noteB)
        .set(noteC)
        .set(noteD)
        .set(noteE)
        .set(noteF)
        .set(noteG)
        .set(noteH)
        .set(noteI);

      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
      expect(ws.resolveLink(noteA, noteA.links[1])).toEqual(noteC.uri);
      expect(ws.resolveLink(noteA, noteA.links[2])).toEqual(noteD.uri);
      expect(ws.resolveLink(noteA, noteA.links[3])).toEqual(noteE.uri);
      expect(ws.resolveLink(noteA, noteA.links[4])).toEqual(noteF.uri);
      expect(ws.resolveLink(noteA, noteA.links[5])).toEqual(noteG.uri);
      expect(ws.resolveLink(noteA, noteA.links[6])).toEqual(noteH.uri);
      expect(ws.resolveLink(noteA, noteA.links[7])).toEqual(noteI.uri);
    });
  });

  describe('Markdown direct links', () => {
    it('should support absolute path 1', () => {
      const noteA = createTestNote({
        uri: '/path/to/page-a.md',
        links: [{ to: '/path/to/another/page-b.md' }],
      });
      const noteB = createTestNote({
        uri: '/path/to/another/page-b.md',
        links: [{ to: '../../to/page-a.md' }],
      });

      const ws = createTestWorkspace();
      ws.set(noteA).set(noteB);
      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
    });

    it('should support relative path 1', () => {
      const noteA = createTestNote({
        uri: '/path/to/page-a.md',
        links: [{ to: './another/page-b.md' }],
      });
      const noteB = createTestNote({
        uri: '/path/to/another/page-b.md',
        links: [{ to: '../../to/page-a.md' }],
      });

      const ws = createTestWorkspace();
      ws.set(noteA).set(noteB);
      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
    });

    it('should support relative path 2', () => {
      const noteA = createTestNote({
        uri: '/path/to/page-a.md',
        links: [{ to: 'more/page-b.md' }],
      });
      const noteB = createTestNote({
        uri: '/path/to/more/page-b.md',
      });
      const ws = createTestWorkspace();
      ws.set(noteA).set(noteB);
      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
    });

    it('should default to relative path', () => {
      const noteA = createTestNote({
        uri: '/path/to/page-a.md',
        links: [{ to: 'page .md' }],
      });
      const noteB = createTestNote({
        uri: '/path/to/page .md',
      });
      const ws = createTestWorkspace();
      ws.set(noteA).set(noteB);
      expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
    });

    it('should support angle syntax #1039', () => {
      const noteA = createNoteFromMarkdown(
        'Content of note a',
        '/path/to/note a.md'
      );
      const noteB = createNoteFromMarkdown(
        'Link to [note](<./note a.md>)',
        '/path/to/note b.md'
      );
      const noteC = createNoteFromMarkdown(
        'Link to [note](./note%20a.md)',
        '/path/to/note c.md'
      );
      const noteD = createNoteFromMarkdown(
        'Link to [note](./note a.md)',
        '/path/to/note d.md'
      );

      const ws = createTestWorkspace();
      ws.set(noteA).set(noteB).set(noteC).set(noteD);

      expect(ws.resolveLink(noteB, noteB.links[0])).toEqual(noteA.uri);
      expect(ws.resolveLink(noteC, noteC.links[0])).toEqual(noteA.uri);
      // noteD has malformed URL with unencoded space, which gets treated as
      // shortcut reference [note] without definition, now correctly filtered out
      expect(noteD.links.length).toEqual(0);
    });

    describe('Workspace-relative paths (root-path relative)', () => {
      it('should resolve workspace-relative paths starting with /', () => {
        const noteA = createTestNote({
          uri: '/workspace/dir1/page-a.md',
          links: [{ to: '/dir2/page-b.md' }],
        });
        const noteB = createTestNote({
          uri: '/workspace/dir2/page-b.md',
        });

        const ws = createTestWorkspace([URI.file('/workspace')]);

        ws.set(noteA).set(noteB);
        expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
      });

      it('should resolve workspace-relative paths with nested directories', () => {
        const noteA = createTestNote({
          uri: '/workspace/project/notes/page-a.md',
          links: [{ to: '/project/assets/image.png' }],
        });
        const assetB = createTestNote({
          uri: '/workspace/project/assets/image.png',
        });

        const ws = createTestWorkspace([URI.file('/workspace')]);

        ws.set(noteA).set(assetB);
        expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(assetB.uri);
      });

      it('should handle workspace-relative paths with fragments', () => {
        const noteA = createTestNote({
          uri: '/workspace/dir1/page-a.md',
          links: [{ to: '/dir2/page-b.md#section' }],
        });
        const noteB = createTestNote({
          uri: '/workspace/dir2/page-b.md',
        });

        const ws = createTestWorkspace([URI.file('/workspace')]);

        ws.set(noteA).set(noteB);
        const resolved = ws.resolveLink(noteA, noteA.links[0]);
        expect(resolved).toEqual(noteB.uri.with({ fragment: 'section' }));
      });

      it('should fall back to placeholder for non-existent workspace-relative paths', () => {
        const noteA = createTestNote({
          uri: '/workspace/dir1/page-a.md',
          links: [{ to: '/dir2/non-existent.md' }],
        });

        const ws = createTestWorkspace([URI.file('/workspace')]);

        ws.set(noteA);
        const resolved = ws.resolveLink(noteA, noteA.links[0]);
        expect(resolved.isPlaceholder()).toBe(true);
        expect(resolved.path).toEqual('/workspace/dir2/non-existent.md');
      });

      it('should work with multiple workspace roots', () => {
        const noteA = createTestNote({
          uri: '/workspace1/dir1/page-a.md',
          links: [{ to: '/shared/page-b.md' }],
        });
        const noteB = createTestNote({
          uri: '/workspace2/shared/page-b.md',
        });

        const ws = createTestWorkspace([
          URI.file('/workspace1'),
          URI.file('/workspace2'),
        ]);

        ws.set(noteA).set(noteB);
        expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
      });

      it('should prefer root[0] when the workspace-relative path resolves to files in multiple roots', () => {
        const noteA = createTestNote({
          uri: '/workspace1/shared/file.md',
        });
        const noteB = createTestNote({
          uri: '/workspace2/shared/file.md',
        });
        const linker = createTestNote({
          uri: '/workspace1/dir/linker.md',
          links: [{ to: '/shared/file.md' }],
        });

        const ws = createTestWorkspace([
          URI.file('/workspace1'),
          URI.file('/workspace2'),
        ]);
        ws.set(noteA).set(noteB).set(linker);

        expect(ws.resolveLink(linker, linker.links[0])).toEqual(noteA.uri);
      });

      it('should create placeholder under root[0] when path does not exist in any root', () => {
        const linker = createTestNote({
          uri: '/workspace1/dir/linker.md',
          links: [{ to: '/non-existent/file.md' }],
        });

        const ws = createTestWorkspace([
          URI.file('/workspace1'),
          URI.file('/workspace2'),
        ]);
        ws.set(linker);

        const resolved = ws.resolveLink(linker, linker.links[0]);
        expect(resolved.isPlaceholder()).toBe(true);
        expect(resolved.path).toEqual('/workspace1/non-existent/file.md');
      });

      it('should resolve absolute directory link to index file in non-root[0] workspace root', () => {
        const linker = createTestNote({
          uri: '/workspace1/dir/linker.md',
          links: [{ to: '/subdir' }],
        });
        const index = createTestNote({ uri: '/workspace2/subdir/index.md' });

        const ws = createTestWorkspace([
          URI.file('/workspace1'),
          URI.file('/workspace2'),
        ]);
        ws.set(linker).set(index);

        expect(ws.resolveLink(linker, linker.links[0])).toEqual(index.uri);
      });

      it('should preserve existing absolute path behavior when no workspace roots provided', () => {
        const noteA = createTestNote({
          uri: '/path/to/page-a.md',
          links: [{ to: '/path/to/another/page-b.md' }],
        });
        const noteB = createTestNote({
          uri: '/path/to/another/page-b.md',
        });

        const ws = createTestWorkspace();
        ws.set(noteA).set(noteB);
        // Default provider without workspace roots should work as before
        expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(noteB.uri);
      });
    });
  });
});

describe('Wikilink directory resolution', () => {
  it('should resolve [[bar]] to bar/index.md when bar.md does not exist', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ slug: 'bar' }],
    });
    const index = createTestNote({ uri: '/path/to/bar/index.md' });
    ws.set(noteA).set(index);
    expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(index.uri);
  });

  it('should resolve [[bar]] to bar/README.md when only README exists', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ slug: 'bar' }],
    });
    const readme = createTestNote({ uri: '/path/to/bar/README.md' });
    ws.set(noteA).set(readme);
    expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(readme.uri);
  });

  it('should prefer bar.md over bar/index.md for [[bar]]', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ slug: 'bar' }],
    });
    const file = createTestNote({ uri: '/path/to/bar.md' });
    const index = createTestNote({ uri: '/path/to/bar/index.md' });
    ws.set(noteA).set(file).set(index);
    expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(file.uri);
  });

  it('should apply fragment to resolved directory index for [[bar#section]]', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ slug: 'bar#section' }],
    });
    const index = createTestNote({ uri: '/path/to/bar/index.md' });
    ws.set(noteA).set(index);
    const result = ws.resolveLink(noteA, noteA.links[0]);
    expect(result.path).toEqual(index.uri.path);
    expect(result.fragment).toEqual('section');
  });

  it('should not resolve [[bar]] to directory index when mode is disabled', () => {
    const ws = createTestWorkspace([], undefined, 'disabled');
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ slug: 'bar' }],
    });
    const index = createTestNote({ uri: '/path/to/bar/index.md' });
    ws.set(noteA).set(index);
    const result = ws.resolveLink(noteA, noteA.links[0]);
    expect(result.isPlaceholder()).toBe(true);
  });

  it('should disambiguate [[zoo/bar]] to zoo/bar/index.md', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/root/page-a.md',
      links: [{ slug: 'zoo/bar' }],
    });
    const fooIndex = createTestNote({ uri: '/root/foo/bar/index.md' });
    const zooIndex = createTestNote({ uri: '/root/zoo/bar/index.md' });
    ws.set(noteA).set(fooIndex).set(zooIndex);
    expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(zooIndex.uri);
  });
});

describe('Directory link resolution', () => {
  it('should resolve a relative directory link to its index file', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ to: 'bar' }],
    });
    const index = createTestNote({ uri: '/path/to/bar/index.md' });
    ws.set(noteA).set(index);
    expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(index.uri);
  });

  it('should resolve a relative directory link to README when no index exists', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ to: 'bar' }],
    });
    const readme = createTestNote({ uri: '/path/to/bar/README.md' });
    ws.set(noteA).set(readme);
    expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(readme.uri);
  });

  it('should prefer a direct file over a directory index', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ to: 'bar' }],
    });
    const file = createTestNote({ uri: '/path/to/bar.md' });
    const index = createTestNote({ uri: '/path/to/bar/index.md' });
    ws.set(noteA).set(file).set(index);
    expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(file.uri);
  });

  it('should treat trailing slash as interchangeable with no slash', () => {
    const ws = createTestWorkspace();
    const noteWithSlash = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ to: 'bar/' }],
    });
    const noteWithout = createTestNote({
      uri: '/path/to/page-b.md',
      links: [{ to: 'bar' }],
    });
    const index = createTestNote({ uri: '/path/to/bar/index.md' });
    ws.set(noteWithSlash).set(noteWithout).set(index);
    expect(ws.resolveLink(noteWithSlash, noteWithSlash.links[0])).toEqual(
      index.uri
    );
    expect(ws.resolveLink(noteWithout, noteWithout.links[0])).toEqual(
      index.uri
    );
  });

  it('should resolve a root-relative directory link to its index file', () => {
    const ws = createTestWorkspace([URI.file('/workspace')]);
    const noteA = createTestNote({
      uri: '/workspace/page-a.md',
      links: [{ to: '/subdir' }],
    });
    const index = createTestNote({ uri: '/workspace/subdir/index.md' });
    ws.set(noteA).set(index);
    expect(ws.resolveLink(noteA, noteA.links[0])).toEqual(index.uri);
  });

  it('should return a placeholder when no file and no index exists', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ to: 'bar' }],
    });
    ws.set(noteA);
    const result = ws.resolveLink(noteA, noteA.links[0]);
    expect(result.isPlaceholder()).toBe(true);
  });

  it('should apply a fragment to the resolved directory index', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ to: 'bar#section' }],
    });
    const index = createTestNote({ uri: '/path/to/bar/index.md' });
    ws.set(noteA).set(index);
    const result = ws.resolveLink(noteA, noteA.links[0]);
    expect(result.path).toEqual(index.uri.path);
    expect(result.fragment).toEqual('section');
  });

  it('should not resolve directory links when mode is disabled', () => {
    const ws = createTestWorkspace([], undefined, 'disabled');
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ to: 'bar' }],
    });
    const index = createTestNote({ uri: '/path/to/bar/index.md' });
    ws.set(noteA).set(index);
    const result = ws.resolveLink(noteA, noteA.links[0]);
    expect(result.isPlaceholder()).toBe(true);
  });
});

describe('Block link resolution', () => {
  it('should resolve [[note#^blockid]] to a URI with ^blockid fragment', () => {
    const workspace = createTestWorkspace();
    const noteA = createNoteFromMarkdown(
      'Link to [[note-b#^myblock]]',
      '/root/note-a.md'
    );
    const noteB = createNoteFromMarkdown(
      'A paragraph ^myblock',
      '/root/note-b.md'
    );
    workspace.set(noteA).set(noteB);
    const result = workspace.resolveLink(noteA, noteA.links[0]);
    expect(result.path).toEqual(noteB.uri.path);
    expect(result.fragment).toEqual('^myblock');
  });

  it('should resolve [[#^blockid]] self-reference with ^blockid fragment', () => {
    const workspace = createTestWorkspace();
    const noteA = createNoteFromMarkdown(
      'Self link [[#^myblock]]\n\nA paragraph ^myblock',
      '/root/note-a.md'
    );
    workspace.set(noteA);
    const result = workspace.resolveLink(noteA, noteA.links[0]);
    expect(result.path).toEqual(noteA.uri.path);
    expect(result.fragment).toEqual('^myblock');
  });

  it('should resolve [[note#^blockid]] even when block does not exist (preserve fragment)', () => {
    const workspace = createTestWorkspace();
    const noteA = createNoteFromMarkdown(
      'Link to [[note-b#^ghost]]',
      '/root/note-a.md'
    );
    const noteB = createNoteFromMarkdown('No anchors here', '/root/note-b.md');
    workspace.set(noteA).set(noteB);
    const result = workspace.resolveLink(noteA, noteA.links[0]);
    expect(result.path).toEqual(noteB.uri.path);
    expect(result.fragment).toEqual('^ghost');
  });
});

describe('External link resolution', () => {
  it('should return the external URI for inline external links', () => {
    const workspace = createTestWorkspace();
    const noteA = createNoteFromMarkdown(
      'Visit [Google](https://google.com)',
      '/root/note-a.md'
    );
    workspace.set(noteA);
    expect(noteA.links.length).toEqual(1);
    expect(noteA.links[0].type).toEqual('external');
    const resolved = workspace.resolveLink(noteA, noteA.links[0]);
    expect(resolved.scheme).toEqual('https');
    expect(resolved.isPlaceholder()).toBe(false);
  });

  it('should return the external URI for reference-style links with external URLs', () => {
    const workspace = createTestWorkspace();
    const noteA = createNoteFromMarkdown(
      'I link to [an external topic][1]\n\n[1]: http://test.com/my-long-link',
      '/root/note-a.md'
    );
    workspace.set(noteA);
    expect(noteA.links.length).toEqual(1);
    expect(noteA.links[0].type).toEqual('external');
    const resolved = workspace.resolveLink(noteA, noteA.links[0]);
    expect(resolved.scheme).toEqual('http');
    expect(resolved.isPlaceholder()).toBe(false);
  });

  it('should not create graph connections for external links', () => {
    const workspace = createTestWorkspace();
    const noteA = createNoteFromMarkdown(
      'Visit [Google](https://google.com) and [[note-b]]',
      '/root/note-a.md'
    );
    const noteB = createNoteFromMarkdown('Note B', '/root/note-b.md');
    workspace.set(noteA).set(noteB);
    const graph = FoamGraph.fromWorkspace(workspace);

    // Only the wikilink to note-b creates a connection
    const connections = graph.getLinks(noteA.uri);
    expect(connections.length).toEqual(1);
    expect(connections[0].target.path).toEqual(noteB.uri.path);

    // No placeholders for external links
    expect(graph.placeholders.size).toEqual(0);
    graph.dispose();
  });
});
