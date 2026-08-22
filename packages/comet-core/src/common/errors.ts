/**
 * A typed error for predictable failure modes that callers map to
 * user-facing error responses.
 */
export class CometError extends Error {
  constructor(
    public readonly code: CometErrorCode,
    message: string,
    public readonly data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CometError';
  }
}

export type CometErrorCode =
  | 'resource_not_found'
  | 'ambiguous_identifier'
  | 'resource_exists'
  | 'conflict'
  | 'invalid_input'
  | 'untrusted_workspace'
  | 'io_error';
