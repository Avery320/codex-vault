import { createTestNote, createTestWorkspace } from '../../test/test-utils';
import { FoamGraph } from './graph';
import { URI } from './uri';

describe('Graph', () => {
  it('should use wikilink slugs to connect nodes', () => {
    const workspace = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/page-a.md',
      links: [
        { slug: 'page-b' },
        { slug: 'page-c' },
        { slug: 'Page D' },
        { slug: 'page e' },
      ],
    });
    const noteB = createTestNote({
      uri: '/page-b.md',
      links: [{ slug: 'page-a' }],
    });
    const noteC = createTestNote({ uri: '/page-c.md' });
    const noteD = createTestNote({ uri: '/Page D.md' });
    const noteE = createTestNote({ uri: '/page e.md' });

    workspace.set(noteA).set(noteB).set(noteC).set(noteD).set(noteE);
    const graph = FoamGraph.fromWorkspace(workspace);

    expect(graph.getBacklinks(noteB.uri).map(l => l.source)).toEqual([
      noteA.uri,
    ]);
    expect(graph.getLinks(noteA.uri).map(l => l.target)).toEqual([
      noteB.uri,
      noteC.uri,
      noteD.uri,
      noteE.uri,
    ]);
  });

  it('should support multiple connections between the same resources', () => {
    const noteA = createTestNote({
      uri: '/path/to/note-a.md',
    });
    const noteB = createTestNote({
      uri: '/note-b.md',
      links: [{ to: noteA.uri.path }, { to: noteA.uri.path }],
    });
    const ws = createTestWorkspace().set(noteA).set(noteB);
    const graph = FoamGraph.fromWorkspace(ws);
    expect(graph.getBacklinks(noteA.uri)).toEqual([
      {
        source: noteB.uri,
        target: noteA.uri,
        link: expect.objectContaining({ type: 'link' }),
      },
      {
        source: noteB.uri,
        target: noteA.uri,
        link: expect.objectContaining({ type: 'link' }),
      },
    ]);
  });

  it('should keep the connection when removing a single link amongst several between two resources', () => {
    const noteA = createTestNote({
      uri: '/path/to/note-a.md',
    });
    const noteB = createTestNote({
      uri: '/note-b.md',
      links: [{ to: noteA.uri.path }, { to: noteA.uri.path }],
    });
    const ws = createTestWorkspace().set(noteA).set(noteB);
    const graph = FoamGraph.fromWorkspace(ws, true);

    expect(graph.getBacklinks(noteA.uri).length).toEqual(2);

    const noteBBis = createTestNote({
      uri: '/note-b.md',
      links: [{ to: noteA.uri.path }],
    });
    ws.set(noteBBis);
    expect(graph.getBacklinks(noteA.uri).length).toEqual(1);

    ws.dispose();
    graph.dispose();
  });

  it('should create inbound connections for target note', () => {
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ slug: 'page-b' }],
    });
    const ws = createTestWorkspace()
      .set(noteA)
      .set(
        createTestNote({
          uri: '/somewhere/page-b.md',
          links: [{ slug: 'page-a' }],
        })
      )
      .set(
        createTestNote({
          uri: '/path/another/page-c.md',
          links: [{ slug: '/path/to/page-a' }],
        })
      )
      .set(
        createTestNote({
          uri: '/absolute/path/page-d.md',
          links: [{ slug: '../to/page-a.md' }],
        })
      );
    const graph = FoamGraph.fromWorkspace(ws);

    expect(
      graph
        .getBacklinks(noteA.uri)
        .map(link => link.source.path)
        .sort()
    ).toEqual(['/path/another/page-c.md', '/somewhere/page-b.md']);
  });

  it('should create inbound connections when targeting a section', () => {
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ slug: 'page-b#section 2' }],
    });
    const noteB = createTestNote({
      uri: '/somewhere/page-b.md',
    });
    const ws = createTestWorkspace().set(noteA).set(noteB);
    const graph = FoamGraph.fromWorkspace(ws);

    expect(graph.getBacklinks(noteB.uri).length).toEqual(1);
  });

  it('should support attachments', () => {
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [
        // wikilink with extension
        { slug: 'attachment-a.pdf' },
        // wikilink without extension
        { slug: 'attachment-b' },
      ],
    });
    const attachmentA = createTestNote({
      uri: '/path/to/more/attachment-a.pdf',
    });
    const attachmentB = createTestNote({
      uri: '/path/to/more/attachment-b.pdf',
    });
    const ws = createTestWorkspace();
    ws.set(noteA).set(attachmentA).set(attachmentB);
    const graph = FoamGraph.fromWorkspace(ws);

    expect(graph.getBacklinks(attachmentA.uri).map(l => l.source)).toEqual([
      noteA.uri,
    ]);
    // Attachments require extension
    expect(graph.getBacklinks(attachmentB.uri).map(l => l.source)).toEqual([]);
  });

  it('should resolve conflicts alphabetically regardless of insertion order', () => {
    const noteA = createTestNote({
      uri: '/path/to/page-a.md',
      links: [{ slug: 'attachment-a.pdf' }],
    });
    const attachmentA = createTestNote({
      uri: '/path/to/more/attachment-a.pdf',
    });
    const attachmentABis = createTestNote({
      uri: '/path/to/attachment-a.pdf',
    });
    for (const attachments of [
      [attachmentA, attachmentABis],
      [attachmentABis, attachmentA],
    ]) {
      const workspace = createTestWorkspace().set(noteA);
      attachments.forEach(attachment => workspace.set(attachment));
      const graph = FoamGraph.fromWorkspace(workspace);
      expect(graph.getLinks(noteA.uri).map(link => link.target)).toEqual([
        attachmentABis.uri,
      ]);
    }
  });
});

describe('Placeholders', () => {
  it('should treat direct links to non-existing files as placeholders', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/somewhere/from/page-a.md',
      links: [{ to: '../page-b.md' }, { to: '/path/to/page-c.md' }],
    });
    ws.set(noteA);
    const graph = FoamGraph.fromWorkspace(ws);

    expect(graph.getAllConnections()[0]).toEqual({
      source: noteA.uri,
      target: URI.placeholder('/somewhere/page-b.md'),
      link: expect.objectContaining({ type: 'link' }),
    });
    expect(graph.getAllConnections()[1]).toEqual({
      source: noteA.uri,
      target: URI.placeholder('/path/to/page-c.md'),
      link: expect.objectContaining({ type: 'link' }),
    });
  });

  it('should treat wikilinks without matching file as placeholders', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/somewhere/page-a.md',
      links: [{ slug: 'page-b' }],
    });
    ws.set(noteA);
    const graph = FoamGraph.fromWorkspace(ws);

    expect(graph.getAllConnections()[0]).toEqual({
      source: noteA.uri,
      target: URI.placeholder('page-b'),
      link: expect.objectContaining({ type: 'wikilink' }),
    });
  });

  it('should treat wikilink with definition to non-existing file as placeholders', () => {
    const ws = createTestWorkspace();
    const noteA = createTestNote({
      uri: '/somewhere/page-a.md',
      links: [
        { slug: 'page-b', definitionUrl: './page-b.md' },
        { slug: 'page-c', definitionUrl: '/path/to/page-c.md' },
      ],
    });
    ws.set(noteA).set(
      createTestNote({ uri: '/different/location/for/note-b.md' })
    );
    const graph = FoamGraph.fromWorkspace(ws);

    expect(graph.getAllConnections()[0]).toEqual({
      source: noteA.uri,
      target: URI.placeholder('/somewhere/page-b.md'),
      link: expect.objectContaining({ type: 'wikilink' }),
    });
    expect(graph.getAllConnections()[1]).toEqual({
      source: noteA.uri,
      target: URI.placeholder('/path/to/page-c.md'),
      link: expect.objectContaining({ type: 'wikilink' }),
    });
  });
});
