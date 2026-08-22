import { ResourceLink } from '../model/note';
import { Range } from '../model/range';
import { analyzeMarkdownLink } from './markdown-link';

type Analysis = ReturnType<typeof analyzeMarkdownLink>;
type Case = [name: string, rawText: string, expected: Partial<Analysis>];

const defaults: Analysis = {
  target: '',
  section: '',
  blockId: '',
  alias: '',
};

function analyze(
  type: ResourceLink['type'],
  rawText: string,
  definition?: ResourceLink['definition']
) {
  return analyzeMarkdownLink({
    type,
    rawText,
    range: Range.create(0, 0),
    isEmbed: rawText.startsWith('!'),
    definition,
  });
}

const wikilinkCases: Case[] = [
  ['target', '[[wikilink]]', { target: 'wikilink' }],
  [
    'section',
    '[[wikilink#section]]',
    { target: 'wikilink', section: 'section' },
  ],
  [
    'alias',
    '[[wikilink|alias]]',
    { target: 'wikilink', alias: 'alias' },
  ],
  [
    'escaped alias separator',
    '[[wikilink\\|alias]]',
    { target: 'wikilink', alias: 'alias' },
  ],
  [
    'spaces in every component',
    '[[note with spaces#section with spaces|alias with spaces]]',
    {
      target: 'note with spaces',
      section: 'section with spaces',
      alias: 'alias with spaces',
    },
  ],
  ['self section', '[[#section]]', { section: 'section' }],
  ['block anchor', '[[note#^block]]', { target: 'note', blockId: 'block' }],
  [
    'caret inside a regular section',
    '[[note#foo^bar]]',
    { target: 'note', section: 'foo^bar' },
  ],
];

const directLinkCases: Case[] = [
  ['target', '[link](to/path.md)', { target: 'to/path.md', alias: 'link' }],
  ['self section', '[link](#section)', { section: 'section', alias: 'link' }],
  [
    'spaced target and section',
    '[link](<path with spaces.md#My Section>)',
    { target: 'path with spaces.md', section: 'My Section', alias: 'link' },
  ],
  [
    'unbracketed spaced target',
    '[link](path with spaces.md)',
    { target: 'path with spaces.md', alias: 'link' },
  ],
  [
    'section followed by a title',
    '![alt](image.jpg#section "Title text")',
    { target: 'image.jpg', section: 'section', alias: 'alt' },
  ],
  [
    'block anchor',
    '[text](note.md#^block)',
    { target: 'note.md', blockId: 'block', alias: 'text' },
  ],
  [
    'regular section',
    '[text](note.md#section)',
    { target: 'note.md', section: 'section', alias: 'text' },
  ],
];

describe('analyzeMarkdownLink', () => {
  it.each(wikilinkCases)('parses wikilink %s', (_name, rawText, expected) => {
    expect(analyze('wikilink', rawText)).toEqual({ ...defaults, ...expected });
  });

  it.each(directLinkCases)(
    'parses direct link %s',
    (_name, rawText, expected) => {
      expect(analyze('link', rawText)).toEqual({ ...defaults, ...expected });
    }
  );

  it('uses raw text instead of a resolved wikilink definition', () => {
    expect(
      analyze('wikilink', '[[my-note#raw section|Display text]]', {
        label: 'my-note',
        url: '../different note.md#different section',
      })
    ).toEqual({
      ...defaults,
      target: 'my-note',
      section: 'raw section',
      alias: 'Display text',
    });
  });

  it('uses section and block fragments from resolved Markdown references', () => {
    for (const [url, fragment] of [
      ['./document.md#section', { section: 'section' }],
      ['./document.md#^block-id', { blockId: 'block-id' }],
    ] as const) {
      expect(
        analyze('link', '[Click here][reference]', {
          label: 'reference',
          url,
        })
      ).toEqual({
        ...defaults,
        target: './document.md',
        alias: 'Click here',
        ...fragment,
      });
    }
  });
});
