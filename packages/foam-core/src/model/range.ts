// Adapted from Microsoft's VS Code range utilities. See LICENSE for details.

import { Position } from './position';

export interface Range {
  start: Position;
  end: Position;
}

function fromPositions(start: Position, end = start): Range {
  const [first, second] =
    Position.compareTo(start, end) <= 0 ? [start, end] : [end, start];
  return {
    start: { ...first },
    end: { ...second },
  };
}

export const Range = {
  create(
    startLine: number,
    startChar: number,
    endLine = startLine,
    endChar = startChar
  ): Range {
    return fromPositions(
      Position.create(startLine, startChar),
      Position.create(endLine, endChar)
    );
  },

  createFromPosition: fromPositions,
};
