import MarkdownIt from 'markdown-it';
import markdownItRegex from 'markdown-it-regex';
import escapeWikilinkPipes from './escape-wikilink-pipes';

function renderer() {
  const md = MarkdownIt();
  escapeWikilinkPipes(md);
  return md;
}

function bodyCellCount(html: string) {
  return (html.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<td>/g) ?? [])
    .length;
}

const aliasRenderingPlugin = (md: MarkdownIt) =>
  md.use(markdownItRegex, {
    name: 'render-alias',
    regex: /\[\[([^[\]]+?)\]\]/,
    replace: (content: string) =>
      `<a>${content.includes('|') ? content.split('|')[1] : content}</a>`,
  });

describe('escapeWikilinkPipes', () => {
  it.each([
    ['text [[note|alias]] more | plain', ['[[note|alias]]'], 2],
    ['[[a|A]] | [[b|B]]', ['[[a|A]]', '[[b|B]]'], 2],
    [
      '![[image#section|Caption & more]] | text',
      ['Caption &amp; more'],
      2,
    ],
  ])('keeps %s inside its intended table cells', (row, fragments, cells) => {
    const html = renderer().render(`| A | B |
| --- | --- |
| ${row} |`);

    for (const fragment of fragments) expect(html).toContain(fragment);
    expect(bodyCellCount(html)).toBe(cells);
  });

  it('does not alter unrelated Markdown', () => {
    const html = renderer().render(`Paragraph with [[note|alias]].

| A | B |
| --- | --- |
| plain | [[without-alias]] |`);

    expect(html).toContain('[[note|alias]]');
    expect(html).toContain('[[without-alias]]');
    expect(html).toContain('plain');
    expect(bodyCellCount(html)).toBe(2);
  });

  it('restores pipes before downstream inline plugins run', () => {
    const md = renderer();
    aliasRenderingPlugin(md);
    const html = md.render(`Outside [[note|Outside]].

| Link |
| --- |
| [[note|Inside]] |`);

    expect(html).toContain('<a>Outside</a>');
    expect(html).toContain('<a>Inside</a>');
    expect(bodyCellCount(html)).toBe(1);
  });

  it('works when table parsing is disabled', () => {
    const md = MarkdownIt().disable(['table']);
    expect(() => escapeWikilinkPipes(md)).not.toThrow();
  });

  it.each([
    [
      'a large list',
      () =>
        Array.from(
          { length: 4500 },
          (_, index) =>
            `- ${index} Long text with [[first note]], [[second note]], and more prose.`
        ).join('\n'),
      ['[[first note]]', '[[second note]]'],
    ],
    [
      'a large table',
      () =>
        [
          '| A | B |',
          '| --- | --- |',
          ...Array.from(
            { length: 2000 },
            (_, index) =>
              `| [[note-${index}|alias ${index}]] | [[b-${index}|B ${index}]] |`
          ),
        ].join('\n'),
      ['[[note-0|alias 0]]', '[[b-1999|B 1999]]'],
    ],
  ])(
    'renders %s without quadratic rescanning',
    (_name, createMarkdown, fragments) => {
      const start = Date.now();
      const html = renderer().render(createMarkdown());
      expect(Date.now() - start).toBeLessThan(1500);
      for (const fragment of fragments) expect(html).toContain(fragment);
    }
  );
});
