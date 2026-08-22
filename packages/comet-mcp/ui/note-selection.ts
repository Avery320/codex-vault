export interface NoteSelection {
  vaultId?: string;
  vaultName: string;
  noteUri: string;
  quote: string;
  startLine: number;
  endLine: number;
  anchor: NoteSelectionAnchor;
}

export interface NoteSelectionAnchor {
  contentSha256: string;
  startPath: number[];
  startOffset: number;
  endPath: number[];
  endOffset: number;
}

interface SourceLineRange {
  startLine: number;
  endLine: number;
}

interface NoteSelectionInput {
  vaultId?: string;
  vaultName: string;
  noteUri: string;
  lineCount: number;
  quote: string;
  startLine: number;
  endLine: number;
  anchor: NoteSelectionAnchor;
}

/** Builds model-facing source lines plus an exact, UI-only DOM anchor. */
export function createNoteSelection(
  input: NoteSelectionInput
): NoteSelection | null {
  const quote = input.quote.replace(/\r\n?/g, '\n').trim();
  const noteUri = input.noteUri.trim();
  if (!quote || !noteUri) return null;

  const startLine = clampLine(input.startLine, input.lineCount);
  const endLine = Math.max(
    startLine,
    clampLine(input.endLine, input.lineCount)
  );
  return {
    vaultId: input.vaultId,
    vaultName: input.vaultName.trim() || 'Vault',
    noteUri,
    quote,
    startLine,
    endLine,
    anchor: input.anchor,
  };
}

export function createSelectionAnchor(
  range: Range,
  root: Element,
  contentSha256: string
): NoteSelectionAnchor | null {
  const startPath = nodePath(range.startContainer, root);
  const endPath = nodePath(range.endContainer, root);
  if (!contentSha256 || !startPath || !endPath) return null;

  return {
    contentSha256,
    startPath,
    startOffset: range.startOffset,
    endPath,
    endOffset: range.endOffset,
  };
}

export function restoreSelectionRange(
  anchor: NoteSelectionAnchor,
  root: Element,
  contentSha256: string
): Range | null {
  if (anchor.contentSha256 !== contentSha256) return null;
  const start = resolveNode(root, anchor.startPath);
  const end = resolveNode(root, anchor.endPath);
  if (!start || !end) return null;

  try {
    const range = document.createRange();
    range.setStart(start, anchor.startOffset);
    range.setEnd(end, anchor.endOffset);
    return range.collapsed ? null : range;
  } catch {
    return null;
  }
}

export function sameSelection(
  left: NoteSelection,
  right: NoteSelection
): boolean {
  return (
    left.vaultId === right.vaultId &&
    left.noteUri === right.noteUri &&
    left.anchor.contentSha256 === right.anchor.contentSha256 &&
    left.anchor.startOffset === right.anchor.startOffset &&
    left.anchor.endOffset === right.anchor.endOffset &&
    samePath(left.anchor.startPath, right.anchor.startPath) &&
    samePath(left.anchor.endPath, right.anchor.endPath)
  );
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

function nodePath(node: Node, root: Element): number[] | null {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: ParentNode | null = current.parentNode;
    if (!parent) return null;
    const index = Array.prototype.indexOf.call(parent.childNodes, current);
    if (index < 0) return null;
    path.unshift(index);
    current = parent as Node;
  }
  return current === root ? path : null;
}

function resolveNode(root: Element, path: readonly number[]): Node | null {
  let current: Node = root;
  for (const index of path) {
    const next: ChildNode | undefined = current.childNodes[index];
    if (!next) return null;
    current = next;
  }
  return current;
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
