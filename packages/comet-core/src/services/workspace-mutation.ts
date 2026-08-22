import { CometError } from '../common/errors';
import type { Comet } from '../model/comet';
import type { URI } from '../model/uri';
import {
  applyTextEdits,
  groupTextEditsByUri,
  type WorkspaceTextEdit,
} from './text-edit';

export async function writeWorkspaceResource(
  comet: Comet,
  uri: URI,
  content: string
) {
  await comet.services.dataStore.write(uri, content);
  return comet.workspace.fetchAndSet(uri);
}

export async function deleteWorkspaceResource(comet: Comet, uri: URI) {
  await comet.services.dataStore.delete(uri);
  comet.workspace.delete(uri);
}

export async function moveWorkspaceResource(
  comet: Comet,
  oldUri: URI,
  newUri: URI
) {
  await comet.services.dataStore.move(oldUri, newUri);
  comet.workspace.delete(oldUri);
  return comet.workspace.fetchAndSet(newUri);
}

export async function applyWorkspaceTextEdits(
  comet: Comet,
  edits: WorkspaceTextEdit[]
) {
  for (const { uri, edits: fileEdits } of groupTextEditsByUri(edits)) {
    const content = await comet.services.dataStore.read(uri);
    if (content === null) {
      throw new CometError(
        'io_error',
        `Cannot apply edits: failed to read ${uri.toFsPath()}`,
        { uri: uri.toFsPath() }
      );
    }
    await writeWorkspaceResource(comet, uri, applyTextEdits(content, fileEdits));
  }
}
