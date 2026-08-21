/**
 * A typed error for predictable failure modes that callers map to
 * user-facing error responses.
 */
export class FoamError extends Error {
  constructor(
    public readonly code: FoamErrorCode,
    message: string,
    public readonly data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FoamError';
  }
}

export type FoamErrorCode =
  | 'resource_not_found'
  | 'ambiguous_identifier'
  | 'resource_exists'
  | 'conflict'
  | 'invalid_input'
  | 'untrusted_workspace'
  | 'io_error';
