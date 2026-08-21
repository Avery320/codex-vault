import { computeWikilinkRenameEdits } from './link-integrity';
import {
  createNoteFromMarkdown,
  createTestWorkspace,
} from '../../test/test-utils';
import { FoamGraph } from '../model/graph';
import { URI } from '../model/uri';
import { Resource } from '../model/note';

const root = URI.file('/workspace');

function createWorkspaceAndGraph(...notes: Resource[]) {
  const workspace = createTestWorkspace([root]);
  notes.forEach(n => workspace.set(n));
  const graph = FoamGraph.fromWorkspace(workspace);
  return { workspace, graph };
}

describe('computeWikilinkRenameEdits', () => {
  it('returns empty array when the note has no backlinks', () => {
    const noteA = createNoteFromMarkdown('note-a.md', 'Content of A', root);
    const { workspace, graph } = createWorkspaceAndGraph(noteA);

    const edits = computeWikilinkRenameEdits(
      workspace,
      graph,
      noteA.uri,
      root.resolve('renamed.md')
    );

    expect(edits).toEqual([]);
  });

  it('updates the wikilink identifier when a note is renamed', () => {
    const noteA = createNoteFromMarkdown('note-a.md', 'Content of A', root);
    const noteB = createNoteFromMarkdown(
      'note-b.md',
      'Link to [[note-a]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB);
    const newUri = root.resolve('renamed-note-a.md');

    const edits = computeWikilinkRenameEdits(
      workspace,
      graph,
      noteA.uri,
      newUri
    );

    expect(edits).toHaveLength(1);
    expect(edits[0].uri).toEqual(noteB.uri);
    expect(edits[0].edit.newText).toEqual('[[renamed-note-a]]');
  });

  it('uses the best identifier based on the new note location', () => {
    const noteA = createNoteFromMarkdown(
      'refactor/wikilink/first/note-a.md',
      'Content of A',
      root
    );
    const noteB = createNoteFromMarkdown(
      'refactor/wikilink/second/note-b.md',
      'Content of B',
      root
    );
    const noteC = createNoteFromMarkdown(
      'note-c.md',
      'Link to [[note-a]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB, noteC);
    // Rename note-a to first/note-b — now ambiguous with second/note-b
    const newUri = root.resolve('refactor/wikilink/first/note-b.md');

    const edits = computeWikilinkRenameEdits(
      workspace,
      graph,
      noteA.uri,
      newUri
    );

    expect(edits[0].edit.newText).toEqual('[[first/note-b]]');
  });

  it('uses the best identifier when moving a note to another directory', () => {
    const noteA = createNoteFromMarkdown(
      'refactor/wikilink/first/note-a.md',
      'Content of A',
      root
    );
    const noteB = createNoteFromMarkdown(
      'refactor/wikilink/second/note-b.md',
      'Content of B',
      root
    );
    const noteC = createNoteFromMarkdown(
      'note-c.md',
      'Link to [[note-a]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB, noteC);
    // Moving note-a into second/ — still unique, so short identifier suffices
    const newUri = root.resolve('refactor/wikilink/second/note-a.md');

    const edits = computeWikilinkRenameEdits(
      workspace,
      graph,
      noteA.uri,
      newUri
    );

    expect(edits[0].edit.newText).toEqual('[[note-a]]');
  });

  it('preserves the alias when updating a wikilink', () => {
    const noteA = createNoteFromMarkdown('note-a.md', 'Content of A', root);
    const noteB = createNoteFromMarkdown(
      'note-b.md',
      'Link to [[note-a|Alias]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB);
    const newUri = root.resolve('new-note-a.md');

    const edits = computeWikilinkRenameEdits(
      workspace,
      graph,
      noteA.uri,
      newUri
    );

    expect(edits[0].edit.newText).toEqual('[[new-note-a|Alias]]');
  });

  it('preserves the section when updating a wikilink', () => {
    const noteA = createNoteFromMarkdown('note-a.md', 'Content of A', root);
    const noteB = createNoteFromMarkdown(
      'note-b.md',
      'Link to [[note-a#Section]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB);
    const newUri = root.resolve('new-note-with-section.md');

    const edits = computeWikilinkRenameEdits(
      workspace,
      graph,
      noteA.uri,
      newUri
    );

    expect(edits[0].edit.newText).toEqual('[[new-note-with-section#Section]]');
  });

  it('does not return edits for markdown links (delegated to VS Code built-in)', () => {
    const noteA = createNoteFromMarkdown('note-a.md', 'Content of A', root);
    const noteB = createNoteFromMarkdown(
      'note-b.md',
      'Link to [[note-a]] and [direct](./note-a.md)',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB);
    const newUri = root.resolve('renamed.md');

    const edits = computeWikilinkRenameEdits(
      workspace,
      graph,
      noteA.uri,
      newUri
    );

    // Only the wikilink should produce an edit; the markdown link should be skipped
    expect(edits).toHaveLength(1);
    expect(edits[0].edit.newText).toEqual('[[renamed]]');
  });
});
