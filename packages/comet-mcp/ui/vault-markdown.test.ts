import { describe, expect, it } from 'vitest';
import { createVaultMarkdownRenderer } from './vault-markdown';

describe('vault markdown renderer', () => {
  const renderer = createVaultMarkdownRenderer();

  it('adds one-based source lines to rendered Markdown blocks', () => {
    const html = renderer.render('# Title\n\nFirst paragraph.\nSecond line.');

    expect(html).toContain(
      '<h1 data-source-line-start="1" data-source-line-end="1">Title</h1>'
    );
    expect(html).toContain(
      '<p data-source-line-start="3" data-source-line-end="4">'
    );
  });

  it('renders wikilinks as escaped internal navigation links', () => {
    const html = renderer.render('See [[folder/child#Details|Child <note>]].');

    expect(html).toContain(
      '<a href="#vault-note=folder%2Fchild" data-vault-note="folder/child">Child &lt;note&gt;</a>'
    );
  });

  it('keeps wikilink aliases inside one table cell', () => {
    const html = renderer.render(
      '| Note |\n| --- |\n| [[folder/child|Child note]] |'
    );

    expect(html.match(/<td/g)).toHaveLength(1);
    expect(html).toContain(
      '<a href="#vault-note=folder%2Fchild" data-vault-note="folder/child">Child note</a>'
    );
  });

  it('renders Obsidian block ids without showing their marker', () => {
    const html = renderer.render('Anchored paragraph ^details');

    expect(html).toContain('<p id="__details"');
    expect(html).toContain('>Anchored paragraph</p>');
    expect(html).not.toContain('^details');
  });

  it('leaves incomplete and embedded wikilinks as text', () => {
    expect(renderer.render('See [[unfinished.')).toContain('[[unfinished.');
    expect(renderer.render('Embed ![[image.png]].')).toContain(
      '![[image.png]]'
    );
  });

  it('does not enable raw HTML', () => {
    expect(renderer.render('<script>alert(1)</script>')).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });
});
