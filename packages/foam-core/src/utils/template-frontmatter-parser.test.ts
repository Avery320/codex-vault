import { parseFoamTemplate } from './template-frontmatter-parser';

describe('parseFoamTemplate', () => {
  it('leaves regular Markdown unchanged', () => {
    const content = '---\ntype: note\n---\n\n# $FOAM_TITLE\n';
    expect(parseFoamTemplate(content)).toEqual({ content });
  });

  it('extracts filepath and removes a template-only frontmatter block', () => {
    expect(
      parseFoamTemplate(`---
foam_template:
  name: New note
  filepath: notes/$FOAM_TITLE.md
---

# $FOAM_TITLE
`)
    ).toEqual({
      filepath: 'notes/$FOAM_TITLE.md',
      content: '\n# $FOAM_TITLE\n',
    });
  });

  it('preserves a second frontmatter block', () => {
    expect(
      parseFoamTemplate(`---
foam_template:
  filepath: notes/$FOAM_TITLE.md
---

---
type: note
---

# $FOAM_TITLE
`).content
    ).toBe(`---
type: note
---

# $FOAM_TITLE
`);
  });

  it('removes template metadata from shared CRLF frontmatter', () => {
    const parsed = parseFoamTemplate(
      '---\r\ntype: daily-note\r\nfoam_template:\r\n  filepath: daily/note.md\r\n  name: Daily Note\r\n  description: Daily template\r\n---\r\n\r\n# Content\r\n'
    );
    expect(parsed).toEqual({
      filepath: 'daily/note.md',
      content: '---\r\ntype: daily-note\r\n---\r\n\r\n# Content\r\n',
    });
  });
});
