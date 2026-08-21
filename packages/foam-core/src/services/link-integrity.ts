import { FoamGraph } from '../model/graph';
import { Resource } from '../model/note';
import { URI } from '../model/uri';
import { FoamWorkspace } from '../model/workspace';
import { MarkdownLink } from './markdown-link';
import { WorkspaceTextEdit } from './text-edit';

function buildFutureWorkspace(
  workspace: FoamWorkspace,
  oldResource: Resource,
  newUri: URI
): FoamWorkspace {
  const future = new FoamWorkspace(workspace.roots, workspace.defaultExtension);
  for (const resource of workspace.list()) {
    future.set(resource);
  }
  future.delete(oldResource.uri);
  future.set({ ...oldResource, uri: newUri });
  return future;
}

function toCorrectCase(identifier: string, directoryUri: URI): string {
  const identifierSegments = identifier.split('/');
  const pathSegments = directoryUri.path.split('/').filter(Boolean);
  return pathSegments.slice(-identifierSegments.length).join('/');
}

export function computeWikilinkRenameEdits(
  workspace: FoamWorkspace,
  graph: FoamGraph,
  oldUri: URI,
  newUri: URI
): WorkspaceTextEdit[] {
  const oldResource = workspace.find(oldUri);
  if (!oldResource) return [];

  const futureWorkspace = buildFutureWorkspace(workspace, oldResource, newUri);
  const oldDirectoryIdentifier = workspace.getDirectoryIdentifier(oldUri);
  const edits: WorkspaceTextEdit[] = [];

  for (const connection of graph.getBacklinks(oldUri)) {
    if (connection.link.type !== 'wikilink') continue;

    const { target } = MarkdownLink.analyzeLink(connection.link);
    let identifier: string;
    if (
      oldDirectoryIdentifier &&
      target.toLocaleLowerCase() === oldDirectoryIdentifier
    ) {
      const newDirectory = newUri.getDirectory();
      const newDirectoryIdentifier =
        futureWorkspace.getDirectoryIdentifier(newUri);
      identifier = newDirectoryIdentifier
        ? toCorrectCase(newDirectoryIdentifier, newDirectory)
        : futureWorkspace.getIdentifier(newUri);
    } else {
      identifier = futureWorkspace.getIdentifier(newUri);
    }

    edits.push({
      uri: connection.source,
      edit: MarkdownLink.createUpdateLinkEdit(connection.link, {
        target: identifier,
      }),
    });
  }

  return edits;
}
