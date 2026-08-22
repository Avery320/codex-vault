import { ResourceLink } from '../model/note';
import { URI } from '../model/uri';

const WIKILINK_PATTERN = /\[\[([^#|]+)?#?([^|]+)?\|?(.*)?\]\]/;
const DIRECT_LINK_PATTERN =
  /\[(.*)\]\((?:<([^#>]*)(?:#([^>]*))?>\s*|([^#>]*?)(?:#([^)>"']*))?(?:\s+(?:"[^"]*"|'[^']*'))?)\)/;

export function analyzeMarkdownLink(link: ResourceLink) {
  try {
    if (link.type === 'wikilink') {
      // Resolved definitions are rendering artifacts; raw wikilink text remains
      // authoritative for the target, fragment, and alias.
      const [, target, section, alias] = WIKILINK_PATTERN.exec(link.rawText);
      const blockMatch = section?.match(/^\^([a-zA-Z0-9-]+)$/);
      return {
        target: target?.replace(/\\/g, '') ?? '',
        section: blockMatch ? '' : section ?? '',
        blockId: blockMatch?.[1] ?? '',
        alias: alias ?? '',
      };
    }

    if (link.type === 'external') {
      const url =
        typeof link.definition === 'string'
          ? link.definition
          : ResourceLink.isResolvedReference(link)
            ? link.definition.url
            : link.rawText;
      return { target: url, section: '', blockId: '', alias: '' };
    }

    if (link.type === 'link') {
      if (ResourceLink.isResolvedReference(link)) {
        const alias = /^\[([^\]]*)\]/.exec(link.rawText)?.[1] ?? '';
        const definitionUri = URI.parse(link.definition.url, 'tmp');
        const fragment = definitionUri.fragment;
        const blockMatch = fragment?.match(/^\^([a-zA-Z0-9-]+)$/);
        return {
          target: definitionUri.path,
          section: blockMatch ? '' : fragment ?? '',
          blockId: blockMatch?.[1] ?? '',
          alias,
        };
      }

      const match = DIRECT_LINK_PATTERN.exec(link.rawText);
      if (!match) {
        return {
          target: '',
          section: '',
          blockId: '',
          alias: /^\[([^\]]*)\]/.exec(link.rawText)?.[1] ?? '',
        };
      }
      const [, alias, angleTarget, angleSection, plainTarget, plainSection] =
        match;
      const target = angleTarget ?? plainTarget ?? '';
      const section = angleSection ?? plainSection ?? '';
      const blockMatch = section?.match(/^\^([a-zA-Z0-9-]+)$/);
      return {
        target,
        section: blockMatch ? '' : section,
        blockId: blockMatch?.[1] ?? '',
        alias: alias ?? '',
      };
    }

    throw new Error(`Link of type ${link.type} is not supported`);
  } catch (error) {
    throw new Error(`Couldn't parse link ${link.rawText} - ${error}`);
  }
}
