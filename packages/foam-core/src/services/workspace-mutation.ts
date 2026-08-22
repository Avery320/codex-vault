import { FoamError } from '../common/errors';
import type { Foam } from '../model/foam';
import type { URI } from '../model/uri';
import {
  applyTextEdits,
  groupTextEditsByUri,
  type WorkspaceTextEdit,
} from './text-edit';

export async function writeWorkspaceResource(
  foam: Foam,
  uri: URI,
  content: string
) {
  await foam.services.dataStore.write(uri, content);
  return foam.workspace.fetchAndSet(uri);
}

export async function deleteWorkspaceResource(foam: Foam, uri: URI) {
  await foam.services.dataStore.delete(uri);
  foam.workspace.delete(uri);
}

export async function moveWorkspaceResource(
  foam: Foam,
  oldUri: URI,
  newUri: URI
) {
  await foam.services.dataStore.move(oldUri, newUri);
  foam.workspace.delete(oldUri);
  return foam.workspace.fetchAndSet(newUri);
}

export async function applyWorkspaceTextEdits(
  foam: Foam,
  edits: WorkspaceTextEdit[]
) {
  for (const { uri, edits: fileEdits } of groupTextEditsByUri(edits)) {
    const content = await foam.services.dataStore.read(uri);
    if (content === null) {
      throw new FoamError(
        'io_error',
        `Cannot apply edits: failed to read ${uri.toFsPath()}`,
        { uri: uri.toFsPath() }
      );
    }
    await writeWorkspaceResource(foam, uri, applyTextEdits(content, fileEdits));
  }
}
