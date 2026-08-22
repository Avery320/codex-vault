import { CometWorkspace } from '../model/workspace';
import { Resource } from '../model/note';
import { URI } from '../model/uri';
import { CometError } from '../common/errors';

/**
 * A reference to a note. Either the URI is known (the caller resolved a
 * path themselves) or a short Comet identifier is given and the workspace
 * resolves it through its identifier index.
 *
 * Callers (CLI / MCP) translate their own inputs (CLI flags,
 * MCP tool args, editor selection) into this shape.
 */
export type NoteRef = { uri: URI } | { identifier: string };

/**
 * Resolves a {@link NoteRef} to a {@link Resource}.
 *
 * Throws {@link CometError} with code:
 * - `resource_not_found` when no note matches
 * - `ambiguous_identifier` when the identifier matches multiple notes
 */
export function resolveNote(
  workspace: CometWorkspace,
  ref: NoteRef
): Resource {
  if ('uri' in ref) {
    const resource = workspace.find(ref.uri);
    if (!resource) {
      throw new CometError(
        'resource_not_found',
        `Note not found at path: ${ref.uri.toFsPath()}`,
        { uri: ref.uri.toFsPath() }
      );
    }
    return resource;
  }

  const candidates = workspace.listByIdentifier(ref.identifier);
  if (candidates.length === 0) {
    throw new CometError(
      'resource_not_found',
      `Note not found: "${ref.identifier}"`,
      { identifier: ref.identifier }
    );
  }
  if (candidates.length > 1) {
    const paths = candidates.map(r => r.uri.toFsPath()).join('\n  ');
    throw new CometError(
      'ambiguous_identifier',
      `Ambiguous identifier "${ref.identifier}". Candidates:\n  ${paths}`,
      {
        identifier: ref.identifier,
        candidates: candidates.map(r => r.uri.toFsPath()),
      }
    );
  }
  return candidates[0];
}
