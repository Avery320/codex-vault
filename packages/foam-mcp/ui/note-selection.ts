export interface NoteSelection {
  vaultId?: string;
  vaultName: string;
  noteUri: string;
  quote: string;
  startLine: number;
  endLine: number;
}

export interface SourceLineRange {
  startLine: number;
  endLine: number;
}

interface NoteSelectionInput {
  vaultId?: string;
  vaultName: string;
  noteUri: string;
  source: string;
  quote: string;
  startLine: number;
  endLine: number;
}

/**
 * Builds a stable, read-only selection anchor from rendered source lines.
 * Character offsets are intentionally omitted: markdown-it does not expose
 * reliable inline source offsets, and guessed offsets would make edits unsafe.
 */
export function createNoteSelection(
  input: NoteSelectionInput
): NoteSelection | null {
  const quote = input.quote.replace(/\r\n?/g, '\n').trim();
  const noteUri = input.noteUri.trim();
  if (!quote || !noteUri) return null;

  const lines = input.source.replace(/\r\n?/g, '\n').split('\n');
  const startLine = clampLine(input.startLine, lines.length);
  const endLine = Math.max(startLine, clampLine(input.endLine, lines.length));
  return {
    vaultId: input.vaultId,
    vaultName: input.vaultName.trim() || 'Vault',
    noteUri,
    quote,
    startLine,
    endLine,
  };
}

export function sourceLineRange(
  selection: Selection,
  root: Element
): SourceLineRange | null {
  if (selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }

  const startElement = sourceLineElement(range.startContainer);
  const endElement = sourceLineElement(range.endContainer);
  const start = Number(startElement?.dataset.sourceLineStart);
  const end = Number(endElement?.dataset.sourceLineEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  return {
    startLine: Math.min(start, end),
    endLine: Math.max(start, end),
  };
}

export function selectionLocationLabel(selection: NoteSelection): string {
  return selection.startLine === selection.endLine
    ? `第 ${selection.startLine} 行`
    : `第 ${selection.startLine}–${selection.endLine} 行`;
}

function clampLine(line: number, lineCount: number): number {
  if (!Number.isFinite(line)) return 1;
  return Math.min(Math.max(Math.trunc(line), 1), Math.max(lineCount, 1));
}

function sourceLineElement(node: Node): HTMLElement | null {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return (
    element?.closest<HTMLElement>(
      '[data-source-line-start][data-source-line-end]'
    ) ?? null
  );
}
