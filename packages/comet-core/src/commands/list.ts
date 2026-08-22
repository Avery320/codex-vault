import { CometGraph } from '../model/graph';
import { CometTags } from '../model/tags';
import { CometWorkspace } from '../model/workspace';
import { URI } from '../model/uri';

// ─── Return types ─────────────────────────────────────────────────────────────

export interface NoteItem {
  id: string;
  uri: URI;
  title: string;
  type: string;
  tags: string[];
}

export interface NoteSummary {
  id: string;
  uri: URI;
  title: string;
}

export interface TagItem {
  tag: string;
  count: number;
}

export interface PlaceholderItem {
  placeholder_id: string;
  uri: URI;
  referenced_by: NoteSummary[];
}

// ─── Domain functions ─────────────────────────────────────────────────────────

export function listNotes(
  workspace: CometWorkspace,
  opts: { type?: string; tag?: string; limit?: number }
): NoteItem[] {
  let resources = workspace.list();

  if (opts.type) {
    resources = resources.filter(r => r.type === opts.type);
  }

  if (opts.tag !== undefined) {
    resources = resources.filter(r =>
      r.tags.some(tag => tag.label === opts.tag)
    );
  }

  if (opts.limit !== undefined) {
    resources = resources.slice(0, opts.limit);
  }

  return resources.map(r => ({
    id: workspace.getIdentifier(r.uri),
    uri: r.uri,
    title: r.title,
    type: r.type,
    tags: r.tags.map(t => t.label),
  }));
}

export function listTags(
  cometTags: CometTags,
  opts: { prefix?: string; limit?: number }
): TagItem[] {
  let entries = Array.from(cometTags.tags.entries()).map(([tag, locations]) => ({
    tag,
    count: locations.length,
  }));

  if (opts.prefix) {
    entries = entries.filter(e => e.tag.startsWith(opts.prefix!));
  }

  entries.sort((a, b) => b.count - a.count);

  if (opts.limit !== undefined) {
    entries = entries.slice(0, opts.limit);
  }

  return entries;
}

export interface OrphansOptions {
  /**
   * Types to exclude from the result. Defaults to `['attachment', 'image']`
   * — only `note`-typed resources are eligible to be orphans.
   */
  excludeTypes?: string[];
}

const DEFAULT_EXCLUDE_TYPES = ['attachment', 'image'];

export function listOrphans(
  workspace: CometWorkspace,
  graph: CometGraph,
  opts: OrphansOptions = {}
): NoteSummary[] {
  const excludeTypes = opts.excludeTypes ?? DEFAULT_EXCLUDE_TYPES;

  return workspace
    .list()
    .filter(r => {
      if (excludeTypes.includes(r.type)) return false;
      return (
        graph.getLinks(r.uri).length === 0 &&
        graph.getBacklinks(r.uri).length === 0
      );
    })
    .map(r => ({
      id: workspace.getIdentifier(r.uri),
      uri: r.uri,
      title: r.title,
    }));
}

export function listDeadends(
  workspace: CometWorkspace,
  graph: CometGraph,
  opts: OrphansOptions = {}
): NoteSummary[] {
  const excludeTypes = opts.excludeTypes ?? DEFAULT_EXCLUDE_TYPES;

  return workspace
    .list()
    .filter(r => {
      if (excludeTypes.includes(r.type)) return false;
      return (
        graph.getBacklinks(r.uri).length > 0 &&
        graph.getLinks(r.uri).length === 0
      );
    })
    .map(r => ({
      id: workspace.getIdentifier(r.uri),
      uri: r.uri,
      title: r.title,
    }));
}

export function listPlaceholders(
  workspace: CometWorkspace,
  graph: CometGraph
): PlaceholderItem[] {
  return Array.from(graph.placeholders.values()).map(placeholderUri => {
    const backlinks = graph.getBacklinks(placeholderUri);
    return {
      placeholder_id: placeholderUri.path.split('/').pop()!,
      uri: placeholderUri,
      referenced_by: backlinks.map(conn => {
        const src = workspace.find(conn.source);
        return {
          id: workspace.getIdentifier(conn.source),
          uri: conn.source,
          title: src?.title ?? '',
        };
      }),
    };
  });
}
