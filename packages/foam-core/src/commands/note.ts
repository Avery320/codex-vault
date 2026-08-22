import { computeWikilinkRenameEdits } from '../services/link-integrity';
import {
  resolveTemplateVariables,
  safeTemplateTitle,
} from '../templates/variable-resolver';
import { parseFoamTemplate } from '../utils/template-frontmatter-parser';
import { type Foam } from '../model/foam';
import { FoamGraph } from '../model/graph';
import { Resource } from '../model/note';
import { FoamWorkspace } from '../model/workspace';
import { URI } from '../model/uri';
import { FoamError } from '../common/errors';
import {
  applyWorkspaceTextEdits,
  deleteWorkspaceResource,
  moveWorkspaceResource,
  writeWorkspaceResource,
} from '../services/workspace-mutation';
import { mergeFrontmatter } from './frontmatter';
import {
  getBasename,
  isAbsolute,
  isWithinPath,
} from '../utils/path';

// ─── Return types ─────────────────────────────────────────────────────────────

export interface NoteDetail {
  id: string;
  uri: URI;
  title: string;
  type: string;
  tags: string[];
  aliases: string[];
  properties: Record<string, unknown>;
  links: { outgoing: string[]; incoming: string[] };
}

export interface NoteCreateResult {
  id: string;
  uri: URI;
  content: string;
}

export interface NoteMoveResult {
  old_uri: URI;
  new_uri: URI;
  old_id: string;
  id: string;
  updated_links: number;
}

// ─── Read: show ───────────────────────────────────────────────────────────────

export function noteShowData(
  workspace: FoamWorkspace,
  graph: FoamGraph,
  resource: Resource
): NoteDetail {
  const id = workspace.getIdentifier(resource.uri);
  const outgoing = graph
    .getLinks(resource.uri)
    .map(c => workspace.getIdentifier(c.target));
  const incoming = graph
    .getBacklinks(resource.uri)
    .map(c => workspace.getIdentifier(c.source));
  return {
    id,
    uri: resource.uri,
    title: resource.title,
    type: resource.type,
    tags: resource.tags.map(t => t.label),
    aliases: resource.aliases.map(a => a.title),
    properties: resource.properties as Record<string, unknown>,
    links: { outgoing, incoming },
  };
}

// ─── Write: create ────────────────────────────────────────────────────────────

/**
 * Creates a new note. If a `new-note.md` template exists in the workspace's
 * `.foam/templates/` directory, it is used to render the file; otherwise a
 * minimal `# title` body is written.
 *
 * The note is created under `opts.dir` if given (relative or absolute);
 * otherwise it goes under the first workspace root. In a multi-root
 * workspace the caller can pass an absolute `dir` to target a specific
 * root.
 *
 * Errors with `resource_exists` if the destination file already exists.
 */
export async function noteCreate(
  foam: Foam,
  opts: {
    title?: string;
    dir?: string;
    uri?: URI;
    content?: string;
    properties?: Record<string, string>;
  }
): Promise<NoteCreateResult> {
  const dataStore = foam.services.dataStore;
  const rootUri = foam.workspace.roots[0];
  const title =
    opts.title ??
    (opts.uri
      ? getBasename(opts.uri.path).replace(/\.md$/i, '')
      : 'untitled');

  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Resolve the target directory relative to the workspace root. Absolute
  // `dir` paths replace the root path; relative paths are joined. Either
  // form is then checked for containment: a `dir` that escapes the root
  // (absolute `/etc/cron.hourly`, relative `../../etc`) is rejected so
  // CLI/MCP callers can't use note creation as an arbitrary-write
  // primitive.
  let targetUri = opts.uri;
  if (!targetUri) {
    const targetDirUri = opts.dir
      ? isAbsolute(opts.dir)
        ? rootUri.forPath(opts.dir)
        : rootUri.joinPath(opts.dir)
      : rootUri;
    if (!isWithinPath(targetDirUri, rootUri)) {
      throw new FoamError(
        'invalid_input',
        `dir is outside the workspace root: ${opts.dir}`,
        { dir: opts.dir }
      );
    }
    targetUri = targetDirUri.joinPath(`${stem}.md`);
  }

  const extraProps = opts.properties ?? {};
  const propLines = Object.entries(extraProps).map(([k, v]) => `${k}: ${v}`);
  const frontmatter =
    propLines.length > 0 ? `---\n${propLines.join('\n')}\n---\n\n` : '';
  let content = `${frontmatter}# ${title}\n`;

  if (opts.uri) {
    content = opts.content ?? `# ${title}\n`;
  } else {
    const templateContent = await dataStore.read(
      rootUri.joinPath('.foam', 'templates', 'new-note.md')
    );
    if (templateContent !== null) {
      const template = parseFoamTemplate(
        resolveTemplateVariables(templateContent, {
          date: new Date(),
          title,
        })
      );
      const templatePath = (
        template.filepath ?? `${safeTemplateTitle(title)}.md`
      ).replace(/[<>?*"|]/g, '-');

      targetUri = foam.workspace.resolveUri(templatePath);
      content = template.content;
    }
    if (opts.content !== undefined) content = opts.content;
  }
  if (opts.properties && (opts.uri || opts.content !== undefined)) {
    content = mergeFrontmatter(content, opts.properties, 'merge');
  }

  // Re-check containment after template processing: a markdown template's
  // frontmatter `filepath:` could otherwise override the target with an
  // escaping path.
  if (!isWithinPath(targetUri, rootUri)) {
    throw new FoamError(
      'invalid_input',
      `Resolved target path is outside the workspace root: ${targetUri.path}`,
      { uri: targetUri.path }
    );
  }

  if (await dataStore.exists(targetUri)) {
    throw new FoamError(
      'resource_exists',
      `File already exists: ${targetUri.toFsPath()}`,
      { uri: targetUri.toFsPath() }
    );
  }

  await writeWorkspaceResource(foam, targetUri, content);

  const id = getBasename(targetUri.path).replace(/\.md$/, '');
  return { id, uri: targetUri, content };
}

// ─── Write: move ──────────────────────────────────────────────────────────────

/**
 * Moves/renames a note and rewrites all wikilinks pointing to it across the
 * workspace.
 *
 * Errors with `resource_exists` if the destination already exists, or
 * `invalid_input` if source equals destination.
 */
export async function noteMove(
  foam: Foam,
  resource: Resource,
  newUri: URI
): Promise<NoteMoveResult> {
  const { workspace, graph } = foam;
  const dataStore = foam.services.dataStore;
  const oldUri = resource.uri;

  if (oldUri.isEqual(newUri)) {
    throw new FoamError(
      'invalid_input',
      'Source and destination are the same.'
    );
  }

  if (await dataStore.exists(newUri)) {
    throw new FoamError(
      'resource_exists',
      `Destination already exists: ${newUri.toFsPath()}`,
      { uri: newUri.toFsPath() }
    );
  }

  const edits = computeWikilinkRenameEdits(workspace, graph, oldUri, newUri);
  await applyWorkspaceTextEdits(foam, edits);

  const oldId = workspace.getIdentifier(oldUri);
  await moveWorkspaceResource(foam, oldUri, newUri);
  const newId = workspace.getIdentifier(newUri);

  return {
    old_uri: oldUri,
    new_uri: newUri,
    old_id: oldId,
    id: newId,
    updated_links: edits.length,
  };
}

// ─── Write: delete ────────────────────────────────────────────────────────────

export async function noteDelete(
  foam: Foam,
  resource: Resource
): Promise<void> {
  await deleteWorkspaceResource(foam, resource.uri);
}
