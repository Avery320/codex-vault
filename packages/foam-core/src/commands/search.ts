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

export function searchByProperty(
  workspace: FoamWorkspace,
  key: string,
  value?: string,
  limit = 20
): SearchMatch[] {
  return workspace
    .list()
    .filter(resource => {
      if (!(key in resource.properties)) return false;
      return value === undefined || String(resource.properties[key]) === value;
    })
    .slice(0, limit)
    .map(r => ({
      id: workspace.getIdentifier(r.uri),
      uri: r.uri,
      title: r.title,
      type: r.type,
      tags: r.tags.map(t => t.label),
      properties: r.properties as Record<string, unknown>,
      line: 1,
      text: `# ${r.title}`,
    }));
}
