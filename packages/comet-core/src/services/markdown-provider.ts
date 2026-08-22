import { Resource, ResourceLink, ResourceParser } from '../model/note';
import { isSome } from '../utils';
import { URI } from '../model/uri';
import { CometWorkspace } from '../model/workspace';
import { ResourceProvider } from '../model/provider';
import { analyzeMarkdownLink } from './markdown-link';
import { IDataStore } from './datastore';

export class MarkdownResourceProvider implements ResourceProvider {
  constructor(
    private readonly dataStore: IDataStore,
    private readonly parser: ResourceParser,
    public readonly noteExtensions: string[] = ['.md'],
    private readonly directoryMode: 'disabled' | 'resolve' = 'resolve'
  ) {}

  supports(uri: URI) {
    return this.noteExtensions.includes(uri.getExtension());
  }

  async fetch(uri: URI) {
    const content = await this.dataStore.read(uri);
    return isSome(content) ? this.parser.parse(uri, content) : null;
  }

  resolveLink(
    workspace: CometWorkspace,
    resource: Resource,
    link: ResourceLink
  ) {
    let targetUri: URI | undefined;
    if (link.type === 'external') {
      const url =
        typeof link.definition === 'string'
          ? link.definition
          : ResourceLink.isResolvedReference(link)
          ? link.definition.url
          : link.rawText;
      return URI.parse(url, 'external');
    }
    const { target, section, blockId } = analyzeMarkdownLink(link);
    switch (link.type) {
      case 'wikilink': {
        if (ResourceLink.isResolvedReference(link)) {
          const definedUri = resource.uri.resolve(link.definition.url);
          targetUri =
            workspace.find(definedUri, resource.uri)?.uri ??
            URI.placeholder(definedUri.path);
          if (definedUri.fragment) {
            targetUri = targetUri.with({ fragment: definedUri.fragment });
          }
        } else {
          targetUri =
            target === ''
              ? resource.uri
              : workspace.find(target, resource.uri)?.uri ??
                this._resolveDirectoryByIdentifier(workspace, target)?.uri ??
                URI.placeholder(target);
          if (blockId) {
            targetUri = targetUri.with({ fragment: `^${blockId}` });
          } else if (section) {
            targetUri = targetUri.with({ fragment: section });
          }
        }
        break;
      }
      case 'link': {
        if (ResourceLink.isUnresolvedReference(link)) {
          // Reference-style link with unresolved reference - treat as placeholder
          targetUri = URI.placeholder(link.definition);
          break;
        }

        // Handle reference-style links first; strip trailing slash (directory links)
        const targetPath = (
          ResourceLink.isResolvedReference(link) ? link.definition.url : target
        ).replace(/\/$/, '');

        let path: string;

        if (targetPath.startsWith('/')) {
          const resolvedUri = workspace.resolveUri(targetPath, resource.uri);
          targetUri =
            workspace.find(targetPath, resource.uri)?.uri ??
            workspace.roots
              .map(root =>
                this._resolveAsDirectory(workspace, root.joinPath(targetPath))
              )
              .find(Boolean)?.uri ??
            URI.placeholder(resolvedUri.path);
        } else {
          // Handle relative paths and non-root paths
          path =
            targetPath.startsWith('./') || targetPath.startsWith('../')
              ? targetPath
              : './' + targetPath;
          // Use getDirectory().joinPath() rather than URI.resolve() to avoid
          // inheriting the parent's .md extension on files with no extension
          // (e.g. dotfiles like .editorconfig, where posix.extname returns '').
          const directResolvedUri = resource.uri.getDirectory().joinPath(path);
          targetUri =
            workspace.find(path, resource.uri)?.uri ??
            this._resolveAsDirectory(workspace, directResolvedUri)?.uri ??
            URI.placeholder(directResolvedUri.path);
        }

        if (section && !targetUri.isPlaceholder()) {
          targetUri = targetUri.with({ fragment: section });
        }
        break;
      }
    }
    return targetUri;
  }

  private _resolveAsDirectory(
    workspace: CometWorkspace,
    resolvedDirUri: URI
  ): Resource | null {
    if (this.directoryMode !== 'resolve') return null;
    return workspace.findByDirectory(resolvedDirUri.path);
  }

  private _resolveDirectoryByIdentifier(
    workspace: CometWorkspace,
    identifier: string
  ): Resource | null {
    if (this.directoryMode !== 'resolve') return null;
    return workspace.listByDirectoryIdentifier(identifier)[0] ?? null;
  }
}
