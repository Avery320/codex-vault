import { CometGraph } from '../model/graph';
import { Resource, ResourceLink } from '../model/note';
import { URI } from '../model/uri';
import { CometWorkspace } from '../model/workspace';
import { analyzeMarkdownLink } from './markdown-link';
import { type WorkspaceTextEdit } from './text-edit';

function buildFutureWorkspace(
  workspace: CometWorkspace,
  oldResource: Resource,
  newUri: URI
): CometWorkspace {
  const future = new CometWorkspace(workspace.roots, workspace.defaultExtension);
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

function retargetWikilink(link: ResourceLink, target: string) {
  const { section, blockId, alias } = analyzeMarkdownLink(link);
  const fragment = blockId ? `#^${blockId}` : section ? `#${section}` : '';
  return {
    range: link.range,
    newText: `${link.isEmbed ? '!' : ''}[[${target}${fragment}${
      alias ? `|${alias}` : ''
    }]]`,
  };
}

export function computeWikilinkRenameEdits(
  workspace: CometWorkspace,
  graph: CometGraph,
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

    const { target } = analyzeMarkdownLink(connection.link);
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
      edit: retargetWikilink(connection.link, identifier),
    });
  }

  return edits;
}
