import { describe, expect, it } from 'vitest';
import {
  createSelectionModelContext,
  readSelectionModelContext,
  type NoteAnnotation,
} from './note-chat-context';

const annotation: NoteAnnotation = {
  id: 'annotation-1',
  vaultId: 'vault-1',
  vaultName: 'Notes',
  noteUri: 'folder/note.md',
  quote: 'Selected text',
  comment: 'Explain this choice.',
  startLine: 4,
  endLine: 5,
  anchor: {
    contentSha256: 'hash-1',
    startPath: [0, 0],
    startOffset: 0,
    endPath: [0, 0],
    endOffset: 4,
  },
};

describe('note chat context', () => {
  it('formats each selection with its own optional comment', () => {
    const context = createSelectionModelContext([
      annotation,
      {
        ...annotation,
        id: 'annotation-2',
        noteUri: 'other.md',
        quote: 'Second selection',
        comment: undefined,
        startLine: 9,
        endLine: 9,
      },
    ]);

    expect(context.content?.[0]?.text).toBe(
      [
        '1. Selected text',
        '   ↳ Explain this choice.',
        '────────────────────────────',
        '2. Second selection',
      ].join('\n')
    );
    expect(context.content?.[0]?.text).not.toContain('Before');
    expect(context.structuredContent).toMatchObject({
      annotations: [
        {
          annotation_id: 'annotation-1',
          note_uri: 'folder/note.md',
          quote: 'Selected text',
          comment: 'Explain this choice.',
          start_line: 4,
          end_line: 5,
        },
        {
          annotation_id: 'annotation-2',
          note_uri: 'other.md',
          quote: 'Second selection',
          start_line: 9,
          end_line: 9,
        },
      ],
    });
    expect(context.presentation).toEqual({
      composerAttachmentLayout: 'pill',
      composerLabel: 'COMET',
    });
    expect(Object.keys(context).sort()).toEqual([
      'content',
      'presentation',
      'structuredContent',
    ]);
  });

  it('clears the host attachment when all annotations are removed', () => {
    expect(createSelectionModelContext([])).toEqual({});
  });

  it('restores annotations from Codex host context', () => {
    const context = createSelectionModelContext([annotation]);
    expect(
      readSelectionModelContext({
        'openai/modelContext': {
          ...context,
          updateId: 'update-1',
        },
      })
    ).toEqual([annotation]);
  });

  it('distinguishes a host clear from an unrelated context update', () => {
    expect(
      readSelectionModelContext({ 'openai/modelContext': null })
    ).toBeNull();
    expect(readSelectionModelContext({ theme: 'dark' })).toBeUndefined();
  });
});
