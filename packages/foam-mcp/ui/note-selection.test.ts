// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { createNoteSelection, sourceLineRange } from './note-selection';

describe('note selection', () => {
  it('creates a compact line-based selection', () => {
    const selection = createNoteSelection({
      vaultId: 'vault-1',
      vaultName: 'Notes',
      noteUri: 'folder/note.md',
      source: ['before', 'selected one', 'selected two', 'after', 'far'].join(
        '\n'
      ),
      quote: 'selected one\nselected two',
      startLine: 2,
      endLine: 3,
    });

    expect(selection).toEqual({
      vaultId: 'vault-1',
      vaultName: 'Notes',
      noteUri: 'folder/note.md',
      quote: 'selected one\nselected two',
      startLine: 2,
      endLine: 3,
    });
  });

  it('rejects empty selections and clamps invalid source lines', () => {
    expect(
      createNoteSelection({
        vaultName: 'Notes',
        noteUri: 'note.md',
        source: 'only line',
        quote: '   ',
        startLine: 1,
        endLine: 1,
      })
    ).toBeNull();

    expect(
      createNoteSelection({
        vaultName: 'Notes',
        noteUri: 'note.md',
        source: 'only line',
        quote: 'only',
        startLine: -20,
        endLine: 100,
      })
    ).toMatchObject({ startLine: 1, endLine: 1 });
  });

  it('maps a DOM selection to rendered Markdown source lines', () => {
    document.body.innerHTML = [
      '<div id="root">',
      '  <p data-source-line-start="2" data-source-line-end="3">Alpha</p>',
      '  <p data-source-line-start="5" data-source-line-end="5">Beta</p>',
      '</div>',
    ].join('');
    const root = document.querySelector('#root')!;
    const paragraphs = root.querySelectorAll('p');
    const range = document.createRange();
    range.setStart(paragraphs[0].firstChild!, 1);
    range.setEnd(paragraphs[1].firstChild!, 2);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(sourceLineRange(selection, root)).toEqual({
      startLine: 2,
      endLine: 5,
    });
  });

  it('rejects collapsed and out-of-reader DOM selections', () => {
    document.body.innerHTML = [
      '<div id="root"><p data-source-line-start="1" data-source-line-end="1">Inside</p></div>',
      '<p id="outside" data-source-line-start="2" data-source-line-end="2">Outside</p>',
    ].join('');
    const root = document.querySelector('#root')!;
    const selection = window.getSelection()!;
    const collapsed = document.createRange();
    collapsed.setStart(root.querySelector('p')!.firstChild!, 0);
    collapsed.collapse(true);
    selection.removeAllRanges();
    selection.addRange(collapsed);
    expect(sourceLineRange(selection, root)).toBeNull();

    const outside = document.createRange();
    outside.selectNodeContents(document.querySelector('#outside')!);
    selection.removeAllRanges();
    selection.addRange(outside);
    expect(sourceLineRange(selection, root)).toBeNull();
  });
});
