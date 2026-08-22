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
    'target and section',
    '[[wikilink#section]]',
    { target: 'wikilink', section: 'section' },
  ],
  [
    'target and alias',
    '[[wikilink|alias]]',
    { target: 'wikilink', alias: 'alias' },
  ],
  [
    'square brackets in target',
    '[[wikilink [with] brackets]]',
    { target: 'wikilink [with] brackets' },
  ],
  [
    'square brackets in alias',
    '[[wikilink|alias [with] brackets]]',
    { target: 'wikilink', alias: 'alias [with] brackets' },
  ],
  [
    'escaped alias separator',
    '[[wikilink\\|alias]]',
    { target: 'wikilink', alias: 'alias' },
  ],
  [
    'spaces in every component',
    '[[wikilink with spaces#section with spaces|alias with spaces]]',
    {
      target: 'wikilink with spaces',
      section: 'section with spaces',
      alias: 'alias with spaces',
    },
  ],
  ['self section', '[[#section]]', { section: 'section' }],
  [
    'block anchor',
    '[[note#^myblock]]',
    { target: 'note', blockId: 'myblock' },
  ],
  ['self block anchor', '[[#^myblock]]', { blockId: 'myblock' }],
  [
    'block anchor and alias',
    '[[note#^myblock|My Alias]]',
    { target: 'note', blockId: 'myblock', alias: 'My Alias' },
  ],
  [
    'caret inside a section',
    '[[note#foo^bar]]',
    { target: 'note', section: 'foo^bar' },
  ],
];

const directLinkCases: Case[] = [
  ['target', '[link](to/path.md)', { target: 'to/path.md', alias: 'link' }],
  [
    'target and section',
    '[link](to/path.md#section)',
    { target: 'to/path.md', section: 'section', alias: 'link' },
  ],
  ['section only', '[link](#section)', { section: 'section', alias: 'link' }],
  [
    'square brackets in label',
    '[inbox [xyz]](to/path.md)',
    { target: 'to/path.md', alias: 'inbox [xyz]' },
  ],
  ['empty label', '[](to/path.md)', { target: 'to/path.md' }],
  ['angle brackets', '[](<to/path.md>)', { target: 'to/path.md' }],
  [
    'angle brackets and section',
    '[](<to/path.md#section>)',
    { target: 'to/path.md', section: 'section' },
  ],
  [
    'spaced section in angle brackets',
    '[link](<to/path.md#My Section>)',
    { target: 'to/path.md', section: 'My Section', alias: 'link' },
  ],
  [
    'spaced section without angle brackets',
    '[link](to/path.md#My Section)',
    { target: 'to/path.md', section: 'My Section', alias: 'link' },
  ],
  [
    'spaced target without angle brackets',
    '[link](path with spaces.md)',
    { target: 'path with spaces.md', alias: 'link' },
  ],
  [
    'spaced target and section in angle brackets',
    '[link](<path with spaces.md#My Section>)',
    { target: 'path with spaces.md', section: 'My Section', alias: 'link' },
  ],
  [
    'spaced section followed by a title',
    '[link](to/path.md#My Section "title")',
    { target: 'to/path.md', section: 'My Section', alias: 'link' },
  ],
  [
    'block anchor',
    '[text](note.md#^myblock)',
    { target: 'note.md', blockId: 'myblock', alias: 'text' },
  ],
  [
    'regular section rather than block anchor',
    '[text](note.md#section)',
    { target: 'note.md', section: 'section', alias: 'text' },
  ],
  [
    'image with double-quoted title',
    '![alt text](image.jpg "Title text")',
    { target: 'image.jpg', alias: 'alt text' },
  ],
  [
    'image with single-quoted title',
    "![alt text](image.jpg 'Title text')",
    { target: 'image.jpg', alias: 'alt text' },
  ],
  [
    'image section followed by a title',
    '![alt text](image.jpg#section "Title text")',
    { target: 'image.jpg', section: 'section', alias: 'alt text' },
  ],
  [
    'path and title containing spaces',
    '![alt](path/to/file.jpg "Title with spaces")',
    { target: 'path/to/file.jpg', alias: 'alt' },
  ],
  [
    'regular link with a title',
    '[link text](document.md "Link title")',
    { target: 'document.md', alias: 'link text' },
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

  it('uses raw text for a resolved wikilink', () => {
    const definition = {
      label: 'my-note',
      url: '../different note.md#different section',
      title: 'Different note',
    };
    expect(
      analyze(
        'wikilink',
        '[[my-note#raw section|Display text]]',
        definition
      )
    ).toEqual({
      ...defaults,
      target: 'my-note',
      section: 'raw section',
      alias: 'Display text',
    });
  });

  it.each([
    ['./document.md#section', { section: 'section' }],
    ['./document.md#^block-id', { blockId: 'block-id' }],
  ])('uses a resolved reference definition at %s', (url, fragment) => {
    expect(
      analyze('link', '[Click here][reference]', {
        label: 'reference',
        url,
        title: 'Document',
      })
    ).toEqual({
      ...defaults,
      target: './document.md',
      alias: 'Click here',
      ...fragment,
    });
  });
});
