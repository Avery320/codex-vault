import { URI } from './uri';
import { Range } from './range';

export interface ResourceLink {
  type: 'wikilink' | 'link' | 'external';
  rawText: string;
  range: Range;
  isEmbed: boolean;
  definition?: string | NoteLinkDefinition;
}

export const ResourceLink = {
  isUnresolvedReference(
    link: ResourceLink
  ): link is ResourceLink & { definition: string } {
    return typeof link.definition === 'string';
  },

  isResolvedReference(
    link: ResourceLink
  ): link is ResourceLink & { definition: NoteLinkDefinition } {
    return typeof link.definition === 'object' && link.definition !== null;
  },
};

export interface NoteLinkDefinition {
  label: string;
  url: string;
  title?: string;
  range?: Range;
}

export interface Tag {
  label: string;
  range: Range;
}

export interface Alias {
  title: string;
  range: Range;
}

export interface Section {
  label: string;
  level: number;
  range: Range;
}

export interface Resource {
  uri: URI;
  type: string;
  title: string;
  properties: any;
  sections: Section[];
  tags: Tag[];
  aliases: Alias[];
  links: ResourceLink[];
}

export interface ResourceParser {
  parse: (uri: URI, text: string) => Resource;
}

export const Resource = {
  sortByPath(a: Resource, b: Resource) {
    return a.uri.path.localeCompare(b.uri.path);
  },
};
