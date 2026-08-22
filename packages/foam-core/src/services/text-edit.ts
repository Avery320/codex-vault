import detectNewline from 'detect-newline';
import { Position } from '../model/position';
import { Range } from '../model/range';
import { URI } from '../model/uri';

export interface TextEdit {
  range: Range;
  newText: string;
}

export function applyTextEdits(
  text: string,
  editOrEdits: TextEdit | TextEdit[]
): string {
  if (Array.isArray(editOrEdits)) {
    const sorted = [...editOrEdits].sort((a, b) =>
      Position.compareTo(b.range.start, a.range.start)
    );
    let result = text;
    for (const edit of sorted) {
      result = applyTextEdits(result, edit);
    }
    return result;
  }

  const eol = detectNewline.graceful(text);
  const lines = text.split(eol);
  const characters = text.split('');
  const startOffset = getOffset(lines, editOrEdits.range.start, eol);
  const endOffset = getOffset(lines, editOrEdits.range.end, eol);

  characters.splice(
    startOffset,
    endOffset - startOffset,
    editOrEdits.newText
  );
  return characters.join('');
}

const getOffset = (
  lines: string[],
  position: Position,
  eol: string
): number => {
  const eolLen = eol.length;
  let offset = 0;
  let i = 0;
  while (i < position.line && i < lines.length) {
    offset = offset + lines[i].length + eolLen;
    i++;
  }
  return offset + Math.min(position.character, lines[i]?.length ?? 0);
};

/**
 * A text edit with workspace context, combining a URI location with the edit operation.
 *
 * This interface uses composition to pair a text edit with its file location,
 * providing a self-contained unit for workspace-wide text modifications.
 */
export interface WorkspaceTextEdit {
  /** The URI of the file where this edit should be applied */
  uri: URI;
  /** The text edit operation to perform */
  edit: TextEdit;
}

interface WorkspaceTextEditGroup {
  uri: URI;
  edits: TextEdit[];
}

export function groupTextEditsByUri(
  edits: WorkspaceTextEdit[]
): WorkspaceTextEditGroup[] {
  const groups = new Map<string, WorkspaceTextEditGroup>();

  for (const { uri, edit } of edits) {
    const key = uri.toString();
    const group = groups.get(key);
    if (group) {
      group.edits.push(edit);
    } else {
      groups.set(key, { uri, edits: [edit] });
    }
  }

  return Array.from(groups.values());
}
