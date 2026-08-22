// Adapted from Microsoft's VS Code position utilities. See LICENSE for details.

export interface Position {
  line: number;
  character: number;
}

export const Position = {
  create(line: number, character: number): Position {
    return { line, character };
  },

  compareTo(first: Position, second: Position): number {
    return first.line === second.line
      ? first.character - second.character
      : first.line - second.line;
  },
};
