import { FoamWorkspace } from '../model/workspace';
import { URI } from '../model/uri';

export interface SearchMatch {
  id: string;
  uri: URI;
  title: string;
  type: string;
  tags: string[];
  properties: Record<string, unknown>;
  line: number;
  text: string;
}

export interface PropertyFilter {
  key: string;
  /** undefined means "has the property" (any value) */
  value?: string;
}

export interface SearchOptions {
  query?: string;
  properties?: PropertyFilter[];
  limit?: number;
}


/**
 * Searches the Foam workspace index by title, alias, tag, and/or frontmatter
 * property. Returns one match per note (matched on the title line).
 *
 * This is an in-memory query over the workspace index — it does not read
 * note bodies. For full-text content search, use the file content directly.
 */
export function searchWorkspace(
  workspace: FoamWorkspace,
  opts: SearchOptions
): SearchMatch[] {
  const limit = opts.limit ?? 20;
  let resources = workspace.list();

  if (opts.properties && opts.properties.length > 0) {
    resources = resources.filter(r =>
      opts.properties!.every(pf => {
        if (!(pf.key in r.properties)) return false;
        if (pf.value === undefined) return true;
        return String(r.properties[pf.key]) === pf.value;
      })
    );
  }

  if (opts.query) {
    const query = opts.query.toLocaleLowerCase();
    const matches = (candidate: string): boolean =>
      candidate.toLocaleLowerCase().includes(query);
    resources = resources.filter(
      r => matches(r.title) || r.aliases.some(a => matches(a.title))
    );
  }

  return resources.slice(0, limit).map(r => {
    return {
      id: workspace.getIdentifier(r.uri),
      uri: r.uri,
      title: r.title,
      type: r.type,
      tags: r.tags.map(t => t.label),
      properties: r.properties as Record<string, unknown>,
      line: 1,
      text: `# ${r.title}`,
    };
  });
}
