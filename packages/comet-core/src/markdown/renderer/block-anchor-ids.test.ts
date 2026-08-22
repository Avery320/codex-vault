import MarkdownIt from 'markdown-it';
import { markdownItBlockAnchorIds } from './block-anchor-ids';

const md = markdownItBlockAnchorIds(MarkdownIt());

function expectAnchorBefore(html: string, id: string, element: string) {
  const anchor = `<a id="__${id}" aria-hidden="true"></a>`;
  expect(html).toContain(anchor);
  expect(html.indexOf(anchor)).toBeLessThan(html.indexOf(`<${element}`));
  expect(html).not.toContain(`^${id}`);
}

describe('Obsidian block anchor rendering', () => {
  it('anchors a paragraph and hides its marker', () => {
    expect(md.render('Some text ^my-block')).toBe(
      '<p id="__my-block">Some text</p>\n'
    );
  });

  it('anchors a tight list item', () => {
    expect(md.render('- Item ^listblock')).toBe(
      '<ul>\n<li id="__listblock">Item</li>\n</ul>\n'
    );
  });

  it('places a standalone anchor before a heading', () => {
    const html = md.render('## My Heading ^headingblock');
    expectAnchorBefore(html, 'headingblock', 'h2');
    expect(html).toContain('<h2>My Heading</h2>');
  });

  it('ignores carets that are not trailing block anchors', () => {
    expect(md.render('Text ^notanid more text')).toBe(
      '<p>Text ^notanid more text</p>\n'
    );
  });

  it('anchors a fenced code block from a following marker', () => {
    const html = md.render('```js\nconsole.log("hi");\n```\n^mycode');
    expectAnchorBefore(html, 'mycode', 'pre');
    expect(html).toContain('<code class="language-js">');
  });

  it('anchors an Obsidian table from a following marker', () => {
    const html = md.render('| A | B |\n| - | - |\n| 1 | 2 |\n\n^mytable');
    expectAnchorBefore(html, 'mytable', 'table');
  });

  it('anchors unordered and ordered lists from following markers', () => {
    for (const [markdown, element, id] of [
      ['- One\n- Two\n^unordered', 'ul', 'unordered'],
      ['1. One\n2. Two\n^ordered', 'ol', 'ordered'],
    ]) {
      const html = md.render(markdown);
      expect(html).toContain(`<${element} id="__${id}">`);
      expect(html).not.toContain(`^${id}`);
    }
  });

  it('anchors a blockquote from a following marker', () => {
    const html = md.render('> First\n> Second\n\n^quote');
    expectAnchorBefore(html, 'quote', 'blockquote');
  });
});
