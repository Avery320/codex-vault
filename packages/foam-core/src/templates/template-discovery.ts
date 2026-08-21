import { URI } from '../model/uri';

/**
 * Returns the URI for the templates directory within a workspace root.
 *
 * The result is derived from {@link rootUri} via `joinPath`, so it inherits
 * the workspace root's scheme and authority.
 */
export function getTemplatesDir(rootUri: URI): URI {
  return rootUri.joinPath('.foam', 'templates');
}

/**
 * Gets the candidate URIs for the new-note template given a templates directory.
 */
export function getNewNoteTemplateCandidateUris(templatesDir: URI): URI[] {
  return [
    templatesDir.joinPath('new-note.js'),
    templatesDir.joinPath('new-note.md'),
  ];
}
