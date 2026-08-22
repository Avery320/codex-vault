import { CometError, CometErrorCode } from '@comet/core';

// Matches the MCP SDK's CallToolResult shape (which carries an open
// index signature). Declared as a type alias so TypeScript treats the
// assignment as structural rather than nominal.
export type ToolErrorResult = {
  [key: string]: unknown;
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
};

/**
 * Converts a thrown error (typically a CometError from a `@comet/core`
 * domain function) into the MCP CallToolResult error shape. Unknown
 * errors are surfaced as `io_error`.
 */
export function mapErrorToToolResult(err: unknown): ToolErrorResult {
  if (err instanceof CometError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: err.code,
            message: err.message,
            data: err.data ?? undefined,
          }),
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  const code: CometErrorCode = 'io_error';
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ code, message }),
      },
    ],
  };
}

/**
 * Wraps a tool handler so any thrown error becomes a structured tool
 * error response instead of crashing the server.
 */
export function withToolErrorHandling<
  TArgs extends unknown[],
  TResult extends object
>(
  handler: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult | ToolErrorResult> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      return mapErrorToToolResult(err);
    }
  };
}
