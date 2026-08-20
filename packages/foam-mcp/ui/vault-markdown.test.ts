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
