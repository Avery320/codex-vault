import { createMarkdownParser } from './markdown-parser';
import { NoteLinkDefinition, ResourceLink } from '../model/note';
import { Logger } from '../utils/log';
import { URI } from '../model/uri';
import { Range } from '../model/range';
import { getRandomURI } from '../../test/test-utils';

Logger.setLevel('error');

const parser = createMarkdownParser();
const createNoteFromMarkdown = (content: string, path?: string) =>
  parser.parse(path ? URI.file(path) : getRandomURI(), content);

describe('Markdown parsing', () => {
  it('should create a Resource from a markdown file', () => {
    const note = createNoteFromMarkdown('Note content', '/a/path.md');
    expect(note.uri).toEqual(URI.file('/a/path.md'));
  });

  describe('Links', () => {
    it('should skip links to a section within the file', () => {
      const note = createNoteFromMarkdown(
        `this is a [link to intro](#introduction)`
      );
      expect(note.links.length).toEqual(0);
    });

    it('should detect regular markdown links', () => {
      const note = createNoteFromMarkdown(
        'this is a [link to page b](../doc/page-b.md)'
      );
      expect(note.links.length).toEqual(1);
      const link = note.links[0];
      expect(link.type).toEqual('link');
      expect(link.rawText).toEqual('[link to page b](../doc/page-b.md)');
      expect(link.isEmbed).toBeFalsy();
    });

    it('should detect embed links', () => {
      const note = createNoteFromMarkdown('this is ![link](../doc/page-b.md)');
      expect(note.links.length).toEqual(1);
      const link = note.links[0];
      expect(link.type).toEqual('link');
      expect(link.isEmbed).toBeTruthy();
    });

    it('should detect wikilinks', () => {
      const note = createNoteFromMarkdown(
        'Some content and [[a link]] to [[a file]]'
      );
      expect(note.links.length).toEqual(2);
      let link = note.links[0];
      expect(link.type).toEqual('wikilink');
      expect(link.rawText).toEqual('[[a link]]');
      link = note.links[1];
      expect(link.type).toEqual('wikilink');
      expect(link.rawText).toEqual('[[a file]]');
      expect(link.isEmbed).toBeFalsy();
    });

    it('should detect wikilink embeds', () => {
      const note = createNoteFromMarkdown('Some content and ![[an embed]]');
      expect(note.links.length).toEqual(1);
      const link = note.links[0];
      expect(link.type).toEqual('wikilink');
      expect(link.rawText).toEqual('![[an embed]]');
      expect(link.isEmbed).toBeTruthy();
    });

    it('should detect wikilinks that have aliases', () => {
      const note = createNoteFromMarkdown(
        'this is [[link|link alias]]. A link with spaces [[other link | spaced]]'
      );
      expect(note.links.length).toEqual(2);
      let link = note.links[0];
      expect(link.type).toEqual('wikilink');
      expect(link.rawText).toEqual('[[link|link alias]]');
      link = note.links[1];
      expect(link.type).toEqual('wikilink');
      expect(link.rawText).toEqual('[[other link | spaced]]');
      expect(link.isEmbed).toBeFalsy();
    });

    it('should skip wikilinks in fenced and inline code', () => {
      const noteA = createNoteFromMarkdown(`
this is some text with our [[first-wikilink]].

\`\`\`
this is inside a [[codeblock]]
\`\`\`

this is \`inside an [[inline-codeblock]]\`

this is some text with our [[second-wikilink]].
    `);
      expect(noteA.links.map(l => l.rawText)).toEqual([
        '[[first-wikilink]]',
        '[[second-wikilink]]',
      ]);
    });

    it('#1545 - should not detect single brackets as links', () => {
      const note = createNoteFromMarkdown(`
"She said [winning the award] was her best year."

We use brackets ([ and ]) to surround links.

This is not an easy task.[^1]

[^1]: It would be easier if more papers were well written.
      `);
      expect(note.links.length).toEqual(0);
    });

    it('should detect reference-style links', () => {
      const note = createNoteFromMarkdown(`
# Test Document

This is a [reference-style link][ref1] and another [link][ref2].

[ref1]: target1.md "Target 1"
[ref2]: target2.md "Target 2"
      `);

      expect(note.links.length).toEqual(2);

      const link1 = note.links[0];
      expect(link1.type).toEqual('link');
      expect(link1.rawText).toEqual('[reference-style link][ref1]');
      expect(ResourceLink.isResolvedReference(link1)).toBe(true);
      const definition1 = link1.definition as NoteLinkDefinition;
      expect(definition1.label).toEqual('ref1');
      expect(definition1.url).toEqual('target1.md');
      expect(definition1.title).toEqual('Target 1');

      const link2 = note.links[1];
      expect(link2.type).toEqual('link');
      expect(link2.rawText).toEqual('[link][ref2]');
      expect(ResourceLink.isResolvedReference(link2)).toBe(true);
      const definition2 = link2.definition as NoteLinkDefinition;
      expect(definition2.label).toEqual('ref2');
      expect(definition2.url).toEqual('target2.md');
    });

    it('should detect inline external links as external type', () => {
      const note = createNoteFromMarkdown(
        'Visit [Google](https://google.com) and [Docs](http://docs.example.com/page).'
      );
      expect(note.links.length).toEqual(2);

      const link1 = note.links[0];
      expect(link1.type).toEqual('external');
      expect(link1.rawText).toEqual('[Google](https://google.com)');
      expect(link1.definition).toEqual('https://google.com');

      const link2 = note.links[1];
      expect(link2.type).toEqual('external');
      expect(link2.definition).toEqual('http://docs.example.com/page');
    });

    it('should detect reference-style links with external URLs as external type', () => {
      const note = createNoteFromMarkdown(`
I link to an [interesting topic][1] and an [[internal-note]]

[1]: http://test.com/my-long-external-link 'Interesting Topic'
[internal-note]: internal-note.md 'Internal Note'
      `);

      // external reference-style link
      const externalLink = note.links.find(
        l => l.rawText === '[interesting topic][1]'
      );
      expect(externalLink).toBeDefined();
      expect(externalLink.type).toEqual('external');
      expect(ResourceLink.isResolvedReference(externalLink)).toBe(true);
      const def = externalLink.definition as NoteLinkDefinition;
      expect(def.url).toEqual('http://test.com/my-long-external-link');

      // internal wikilink is unaffected
      const internalLink = note.links.find(l => l.type === 'wikilink');
      expect(internalLink).toBeDefined();
    });

    it('keeps footnotes separate from regular reference links', () => {
      const note = createNoteFromMarkdown(
        `[ref]: /path/to/file.md\n[text][ref]\n\nFootnote[^1][^2]\n\n[^1]: first\n\n[^2]: second`
      );
      expect(note.links).toHaveLength(1);
      expect(note.links[0].type).toBe('link');
    });
  });


  describe('Note Title', () => {
    it('should initialize note title if heading exists', () => {
      const note = createNoteFromMarkdown(`
# Page A
this note has a title
    `);
      expect(note.title).toBe('Page A');
    });

    it('should default to file name if heading does not exist', () => {
      const note = createNoteFromMarkdown(
        `This file has no heading.`,
        '/page-d.md'
      );

      expect(note.title).toEqual('page-d');
    });

    it('should give precedence to frontmatter title over other headings', () => {
      const note = createNoteFromMarkdown(`
---
title: Note Title
date: 20-12-12
---

# Other Note Title
    `);

      expect(note.title).toBe('Note Title');
    });

  });

  describe('Frontmatter', () => {
    it('should parse yaml frontmatter', () => {
      const note = createNoteFromMarkdown(`
---
title: Note Title
date: 20-12-12
---

# Other Note Title`);

      expect(note.properties.title).toBe('Note Title');
      expect(note.properties.date).toBe('20-12-12');
    });

    it('should not fail when there are issues with parsing frontmatter', () => {
      const note = createNoteFromMarkdown(`
---
title: - one
 - two
 - #
---

`);

      expect(note.properties).toEqual({});
    });

    it('#1467 - should parse yaml frontmatter with colon in value', () => {
      const note = createNoteFromMarkdown(`
---
tags: test
source: https://example.com/page:123
---

# Note with colon in meta value\n`);
      expect(note.properties.source).toBe('https://example.com/page:123');
      expect(note.tags[0].label).toEqual('test');
    });

    it('#1615 - should detect tags when a hyphenated property appears before tags', () => {
      const note = createNoteFromMarkdown(`
---
date-created: 2024-01-01
tags: hello, world
---
`);
      expect(note.tags.map(t => t.label)).toContain('hello');
      expect(note.tags.map(t => t.label)).toContain('world');
    });
  });

  describe('Tags', () => {
    it('can find tags in the text of the note', () => {
      const noteA = createNoteFromMarkdown(`
# this is a #heading
#this is some #text that includes #tags we #care-about.
    `);
      expect(noteA.tags).toEqual([
        { label: 'heading', range: Range.create(1, 12, 1, 20) },
        { label: 'this', range: Range.create(2, 0, 2, 5) },
        { label: 'text', range: Range.create(2, 14, 2, 19) },
        { label: 'tags', range: Range.create(2, 34, 2, 39) },
        { label: 'care-about', range: Range.create(2, 43, 2, 54) },
      ]);
    });

    it('skips tags in fenced and inline code', () => {
      const noteA = createNoteFromMarkdown(`
this is some #text that includes #tags we #care-about.

\`\`\`
this is a #codeblock
\`\`\`
this is an \`inline #codeblock\`
    `);
      expect(noteA.tags.map(t => t.label)).toEqual([
        'text',
        'tags',
        'care-about',
      ]);
    });

    it('can find tags as text in yaml', () => {
      const noteA = createNoteFromMarkdown(`
---
tags: hello, world  this_is_good
---
# this is a heading
this is some #text that includes #tags we #care-about.
    `);
      expect(noteA.tags.map(t => t.label)).toEqual([
        'hello',
        'world',
        'this_is_good',
        'text',
        'tags',
        'care-about',
      ]);
    });

    it('provides a specific range for tags in yaml', () => {
      // For now it's enough to just get the YAML block range
      // in the future we might want to be more specific

      const noteA = createNoteFromMarkdown(`
---
prop: hello world
tags: [hello, world, this_is_good]
another: i love the world
---
# this is a heading
this is some text
    `);
      expect(noteA.tags[0]).toEqual({
        label: 'hello',
        range: Range.create(3, 7, 3, 12),
      });
      expect(noteA.tags[1]).toEqual({
        label: 'world',
        range: Range.create(3, 14, 3, 19),
      });
      expect(noteA.tags[2]).toEqual({
        label: 'this_is_good',
        range: Range.create(3, 21, 3, 33),
      });

      const noteB = createNoteFromMarkdown(`
---
prop: hello world
tags: 
- hello
- world
- this_is_good
another: i love the world
---
# this is a heading
this is some text
            `);
      expect(noteB.tags[0]).toEqual({
        label: 'hello',
        range: Range.create(4, 2, 4, 7),
      });
      expect(noteB.tags[1]).toEqual({
        label: 'world',
        range: Range.create(5, 2, 5, 7),
      });
      expect(noteB.tags[2]).toEqual({
        label: 'this_is_good',
        range: Range.create(6, 2, 6, 14),
      });
    });
  });

  describe('Sections', () => {
    it('should find sections within the note', () => {
      const note = createNoteFromMarkdown(`
# Section 1

This is the content of section 1.

## Section 1.1

This is the content of section 1.1.

# Section 2

This is the content of section 2.
      `);
      expect(note.sections).toHaveLength(3);
      expect(note.sections[0].label).toEqual('Section 1');
      expect(note.sections[0].level).toEqual(1);
      expect(note.sections[0].range).toEqual(Range.create(1, 0, 9, 0));
      expect(note.sections[1].label).toEqual('Section 1.1');
      expect(note.sections[1].level).toEqual(2);
      expect(note.sections[1].range).toEqual(Range.create(5, 0, 9, 0));
      expect(note.sections[2].label).toEqual('Section 2');
      expect(note.sections[2].level).toEqual(1);
      expect(note.sections[2].range).toEqual(Range.create(9, 0, 13, 0));
    });

    it('should support wikilinks and links in the section label', () => {
      const note = createNoteFromMarkdown(`
# Section with [[wikilink]]

This is the content of section with wikilink

## Section with [url](https://google.com)

This is the content of section with url`);
      expect(note.sections).toHaveLength(2);
      expect(note.sections[0].label).toEqual('Section with wikilink');
      expect(note.sections[1].label).toEqual('Section with url');
    });

    it('should capture heading levels h1 through h6', () => {
      const note = createNoteFromMarkdown(`
# H1
## H2
### H3
#### H4
##### H5
###### H6
`);
      expect(note.sections).toHaveLength(6);
      expect(note.sections[0].level).toEqual(1);
      expect(note.sections[1].level).toEqual(2);
      expect(note.sections[2].level).toEqual(3);
      expect(note.sections[3].level).toEqual(4);
      expect(note.sections[4].level).toEqual(5);
      expect(note.sections[5].level).toEqual(6);
    });
  });

  describe('Alias', () => {
    it('reads comma-separated and YAML-array aliases', () => {
      for (const frontmatter of [
        'alias: alias 1, alias 2, alias3',
        'alias:\n- alias 1\n- alias 2\n- alias3',
      ]) {
        const note = parser.parse(
          URI.file('/path/to/a'),
          `---\n${frontmatter}\n---\nContent`
        );
        expect(note.aliases.map(alias => alias.title)).toEqual([
          'alias 1',
          'alias 2',
          'alias3',
        ]);
      }
    });
  });
});
