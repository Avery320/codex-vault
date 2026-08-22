import { Point, Node, Position as AstPosition } from 'unist';
import unified from 'unified';
import markdownParse from 'remark-parse';
import wikiLinkPlugin from 'remark-wiki-link';
import frontmatterPlugin from 'remark-frontmatter';
import { parse as parseYAML } from 'yaml';
import visit from 'unist-util-visit';
import {
  NoteLinkDefinition,
  Resource,
  ResourceLink,
  ResourceParser,
} from '../model/note';
import { Position } from '../model/position';
import { Range } from '../model/range';
import { extractHashtags, extractTagsFromProp, isSome } from '../utils';
import { Logger } from '../utils/log';
import { URI } from '../model/uri';

export interface ParserPlugin {
  name?: string;
  visit?: (node: Node, note: Resource, noteSource: string) => void;
  onDidInitializeParser?: (parser: unified.Processor) => void;
  onWillParseMarkdown?: (markdown: string) => string;
  onWillVisitTree?: (tree: Node, note: Resource) => void;
  onDidVisitTree?: (tree: Node, note: Resource) => void;
  onDidFindProperties?: (properties: any, note: Resource, node: Node) => void;
}

const parser = unified()
  .use(markdownParse, { gfm: true })
  .use(frontmatterPlugin, ['yaml'])
  .use(wikiLinkPlugin, { aliasDivider: '|' });

export function createMarkdownParser(
  extraPlugins: ParserPlugin[] = []
): ResourceParser {
  const plugins = [
    titlePlugin,
    wikilinkPlugin,
    tagsPlugin,
    aliasesPlugin,
    sectionsPlugin,
    ...extraPlugins,
  ];

  for (const plugin of plugins) {
    try {
      plugin.onDidInitializeParser?.(parser);
    } catch (e) {
      handleError(plugin, 'onDidInitializeParser', undefined, e);
    }
  }

  const foamParser: ResourceParser = {
    parse: (uri: URI, markdown: string): Resource => {
      Logger.debug('Parsing:', uri.toString());
      for (const plugin of plugins) {
        try {
          plugin.onWillParseMarkdown?.(markdown);
        } catch (e) {
          handleError(plugin, 'onWillParseMarkdown', uri, e);
        }
      }
      const tree = parser.parse(markdown);

      const note: Resource = {
        uri: uri,
        type: 'note',
        properties: {},
        title: '',
        sections: [],
        tags: [],
        aliases: [],
        links: [],
      };

      const localDefinitions: NoteLinkDefinition[] = [];

      for (const plugin of plugins) {
        try {
          plugin.onWillVisitTree?.(tree, note);
        } catch (e) {
          handleError(plugin, 'onWillVisitTree', uri, e);
        }
      }
      visit(tree, node => {
        if (node.type === 'yaml') {
          try {
            const yamlProperties = parseYAML((node as any).value) ?? {};
            note.properties = {
              ...note.properties,
              ...yamlProperties,
            };
            for (const plugin of plugins) {
              try {
                plugin.onDidFindProperties?.(yamlProperties, note, node);
              } catch (e) {
                handleError(plugin, 'onDidFindProperties', uri, e);
              }
            }
          } catch (e) {
            Logger.warn(`Error while parsing YAML for [${uri.toString()}]`, e);
          }
        }

        if (node.type === 'definition') {
          const label: string = (node as any).label ?? '';
          if (label.startsWith('^')) {
            // Footnote definitions are not regular link definitions.
            return;
          }
          localDefinitions.push({
            label: (node as any).label,
            url: (node as any).url,
            title: (node as any).title,
            range: astPositionToFoamRange(node.position!),
          });
        }

        for (const plugin of plugins) {
          try {
            plugin.visit?.(node, note, markdown);
          } catch (e) {
            handleError(plugin, 'visit', uri, e);
          }
        }
      });
      for (const plugin of plugins) {
        try {
          plugin.onDidVisitTree?.(tree, note);
        } catch (e) {
          handleError(plugin, 'onDidVisitTree', uri, e);
        }
      }

      // Post-processing: Resolve reference identifiers to definitions for all links
      note.links.forEach(link => {
        if (ResourceLink.isUnresolvedReference(link)) {
          // This link has a reference identifier (from linkReference or wikilink)
          const referenceId = link.definition;
          const definition = localDefinitions.find(
            def => def.label === referenceId
          );

          // Set definition to definition object if found, otherwise keep as string
          (link as any).definition = definition || referenceId;

          // If the resolved definition points to an external URL, promote to 'external' type
          if (definition && link.type === 'link') {
            const resolvedUri = URI.parse(definition.url, 'tmp');
            if (resolvedUri.scheme !== 'file' && resolvedUri.scheme !== 'tmp') {
              (link as any).type = 'external';
            }
          }
        }
      });

      // For type: 'link', keep only if:
      // - It's a direct link [text](url) - no definition field
      // - It's a resolved reference - definition is an object
      note.links = note.links.filter(
        link =>
          link.type === 'wikilink' ||
          link.type === 'external' ||
          !ResourceLink.isUnresolvedReference(link)
      );

      Logger.debug('Result:', note);
      return note;
    },
  };

  return foamParser;
}

/**
 * Traverses all the children of the given node, extracts
 * the text from them, and returns it concatenated.
 *
 * @param root the node from which to start collecting text
 */
const getTextFromChildren = (root: Node): string => {
  let text = '';
  visit(root, node => {
    if (node.type === 'text' || node.type === 'wikiLink') {
      text = text + ((node as any).value || '');
    }
  });
  return text;
};

// Matches a top-level YAML key: starts at column 0 with a non-hyphen, non-space,
// non-comment character, and contains a colon (e.g. "tags:", "date-created:").
const YAML_KEY_LINE_RE = /^([^-\s#][^:]*?):\s*(.*)/;

function getPropertiesInfoFromYAML(yamlText: string): {
  [key: string]: { key: string; value: string; text: string; line: number };
} {
  const lines = yamlText.split('\n');
  const result: {
    [key: string]: { key: string; value: string; text: string; line: number };
  } = {};
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const match = lines[lineIdx].match(YAML_KEY_LINE_RE);
    if (!match) {
      continue;
    }
    const key = match[1];
    let text = lines[lineIdx];
    let j = lineIdx + 1;
    // Collect continuation lines: everything that isn't the start of a new key
    while (j < lines.length && !YAML_KEY_LINE_RE.test(lines[j])) {
      text += '\n' + lines[j];
      j++;
    }
    const value = text.slice(key.length + 1).trim();
    result[key] = { key, value, text, line: lineIdx };
  }
  return result;
}

const tagsPlugin: ParserPlugin = {
  name: 'tags',
  onDidFindProperties: (props, note, node) => {
    if (isSome(props.tags)) {
      const tagPropertyInfo = getPropertiesInfoFromYAML((node as any).value)[
        'tags'
      ];
      const tagPropertyStartLine =
        node.position!.start.line + tagPropertyInfo.line;
      const tagPropertyLines = tagPropertyInfo.text.split('\n');
      const yamlTags = extractTagsFromProp(props.tags);
      for (const tag of yamlTags) {
        const tagLine = tagPropertyLines.findIndex(l => l.includes(tag));
        const line = tagPropertyStartLine + tagLine;
        const charStart = tagPropertyLines[tagLine].indexOf(tag);
        note.tags.push({
          label: tag,
          range: Range.createFromPosition(
            Position.create(line, charStart),
            Position.create(line, charStart + tag.length)
          ),
        });
      }
    }
  },
  visit: (node, note) => {
    if (node.type === 'text') {
      const tags = extractHashtags((node as any).value);
      for (const tag of tags) {
        const start = astPointToFoamPosition(node.position!.start);
        start.character = start.character + tag.offset;
        const end: Position = {
          line: start.line,
          character: start.character + tag.label.length + 1,
        };
        note.tags.push({
          label: tag.label,
          range: Range.createFromPosition(start, end),
        });
      }
    }
  },
};

let sectionStack: Array<{ label: string; level: number; start: Position }> = [];
const sectionsPlugin: ParserPlugin = {
  name: 'section',
  onWillVisitTree: () => {
    sectionStack = [];
  },
  visit: (node, note) => {
    if (node.type === 'heading') {
      const level = (node as any).depth;
      const rawLabel = getTextFromChildren(node);
      // Strip trailing block anchor (e.g. "My Heading ^blockid" → "My Heading")
      const label = rawLabel.replace(/\s\^[a-zA-Z0-9-]+$/, '');
      if (!label || !level) {
        return;
      }
      const start = astPositionToFoamRange(node.position!).start;

      // Close all the sections that are not parents of the current section
      while (
        sectionStack.length > 0 &&
        sectionStack[sectionStack.length - 1].level >= level
      ) {
        const section = sectionStack.pop();
        note.sections.push({
          label: section.label,
          level: section.level,
          range: Range.createFromPosition(section.start, start),
        });
      }

      // Add the new section to the stack
      sectionStack.push({ label, level, start });
    }
  },
  onDidVisitTree: (tree, note) => {
    const end = Position.create(
      astPointToFoamPosition(tree.position.end).line + 1,
      0
    );
    // Close all the remaining sections
    while (sectionStack.length > 0) {
      const section = sectionStack.pop();
      note.sections.push({
        label: section.label,
        level: section.level,
        range: { start: section.start, end },
      });
    }
    note.sections.sort((a, b) =>
      Position.compareTo(a.range.start, b.range.start)
    );
  },
};

const titlePlugin: ParserPlugin = {
  name: 'title',
  visit: (node, note) => {
    if (
      note.title === '' &&
      node.type === 'heading' &&
      (node as any).depth === 1
    ) {
      const title = getTextFromChildren(node);
      note.title = title.length > 0 ? title : note.title;
    }
  },
  onDidFindProperties: (props, note) => {
    // Give precedence to the title from the frontmatter if it exists
    note.title = props.title?.toString() ?? note.title;
  },
  onDidVisitTree: (_tree, note) => {
    if (note.title === '') {
      note.title = note.uri.getName();
    }
  },
};

const aliasesPlugin: ParserPlugin = {
  name: 'aliases',
  onDidFindProperties: (props, note, node) => {
    if (isSome(props.alias)) {
      const aliases = Array.isArray(props.alias)
        ? props.alias
        : props.alias.split(',').map(m => m.trim());
      for (const alias of aliases) {
        note.aliases.push({
          title: alias,
          range: astPositionToFoamRange(node.position!),
        });
      }
    }
  },
};

const wikilinkPlugin: ParserPlugin = {
  name: 'wikilink',
  visit: (node, note, noteSource) => {
    if (node.type === 'wikiLink') {
      const isEmbed =
        noteSource.charAt(node.position!.start.offset - 1) === '!';

      const literalContent = noteSource.substring(
        isEmbed
          ? node.position!.start.offset! - 1
          : node.position!.start.offset!,
        node.position!.end.offset!
      );

      const range = isEmbed
        ? Range.create(
            node.position.start.line - 1,
            node.position.start.column - 2,
            node.position.end.line - 1,
            node.position.end.column - 1
          )
        : astPositionToFoamRange(node.position!);

      note.links.push({
        type: 'wikilink',
        rawText: literalContent,
        range,
        isEmbed,
        definition: (node as any).value,
      });
    }
    if (node.type === 'link' || node.type === 'image') {
      const targetUri = (node as any).url;
      const uri = note.uri.resolve(targetUri);
      if (uri.path === note.uri.path) {
        return;
      }
      const literalContent = noteSource.substring(
        node.position!.start.offset!,
        node.position!.end.offset!
      );
      if (uri.scheme !== 'file') {
        note.links.push({
          type: 'external',
          rawText: literalContent,
          range: astPositionToFoamRange(node.position!),
          isEmbed: literalContent.startsWith('!'),
          definition: targetUri,
        });
        return;
      }
      note.links.push({
        type: 'link',
        rawText: literalContent,
        range: astPositionToFoamRange(node.position!),
        isEmbed: literalContent.startsWith('!'),
      });
    }
    if (node.type === 'linkReference') {
      const identifier: string = (node as any).identifier ?? '';
      if (identifier.startsWith('^')) {
        // Footnote references are not regular links.
        return;
      }
      const literalContent = noteSource.substring(
        node.position!.start.offset!,
        node.position!.end.offset!
      );

      note.links.push({
        type: 'link',
        rawText: literalContent,
        range: astPositionToFoamRange(node.position!),
        isEmbed: false,
        // Store reference identifier temporarily - will be resolved in onDidVisitTree
        definition: identifier,
      });
    }
  },
};

const handleError = (
  plugin: ParserPlugin,
  fnName: string,
  uri: URI | undefined,
  e: Error
): void => {
  const name = plugin.name || '';
  Logger.warn(
    `Error while executing [${fnName}] in plugin [${name}]. ${
      uri ? 'for file [' + uri.toString() : ']'
    }.`,
    e
  );
};

/**
 * Converts the 1-index Point object into the VS Code 0-index Position object
 * @param point ast Point (1-indexed)
 * @returns Foam Position  (0-indexed)
 */
const astPointToFoamPosition = (point: Point): Position => {
  return Position.create(point.line - 1, point.column - 1);
};

/**
 * Converts the 1-index Position object into the VS Code 0-index Range object
 * @param position an ast Position object (1-indexed)
 * @returns Foam Range  (0-indexed)
 */
const astPositionToFoamRange = (pos: AstPosition): Range =>
  Range.create(
    pos.start.line - 1,
    pos.start.column - 1,
    pos.end.line - 1,
    pos.end.column - 1
  );
