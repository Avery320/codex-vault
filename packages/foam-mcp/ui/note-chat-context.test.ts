import { describe, expect, it } from 'vitest';
import {
  createSelectionModelContext,
  type NoteAnnotation,
} from './note-chat-context';

const annotation: NoteAnnotation = {
  vaultId: 'vault-1',
  vaultName: 'Notes',
  noteUri: 'folder/note.md',
  quote: 'Selected text',
  comment: 'Explain this choice.',
  startLine: 4,
  endLine: 5,
};

describe('note chat context', () => {
  it('formats each selection with its own optional comment', () => {
    const context = createSelectionModelContext([
      annotation,
      {
        ...annotation,
        noteUri: 'other.md',
        quote: 'Second selection',
        comment: undefined,
        startLine: 9,
        endLine: 9,
      },
    ]);

    expect(context.content[0]?.text).toBe(
      [
        '1。 選取的文字：',
        'Selected text',
        '',
        '使用者留言：',
        'Explain this choice.',
        '',
        '2。 選取的文字：',
        'Second selection',
      ].join('\n')
    );
    expect(context.content[0]?.text).not.toContain('Before');
    expect(context.structuredContent).toMatchObject({
      annotations: [
        {
          note_uri: 'folder/note.md',
          quote: 'Selected text',
          comment: 'Explain this choice.',
          start_line: 4,
          end_line: 5,
        },
        {
          note_uri: 'other.md',
          quote: 'Second selection',
          start_line: 9,
          end_line: 9,
        },
      ],
    });
    expect(Object.keys(context).sort()).toEqual([
      'content',
      'structuredContent',
    ]);
  });
});
