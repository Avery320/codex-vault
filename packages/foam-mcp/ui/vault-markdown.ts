import MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

export interface VaultMarkdownRenderer {
  render(source: string): string;
}

/**
 * Creates the Markdown renderer used by Vault Explorer.
 *
 * The renderer owns two Vault-specific concerns:
 * - Obsidian-style wikilinks become internal Vault navigation links.
 * - Rendered blocks retain their one-based Markdown source line range.
 *
 * Keeping these rules behind one renderer boundary lets richer Markdown
 * support replace this implementation without coupling selection handling to
 * markdown-it internals.
 */
export function createVaultMarkdownRenderer(): VaultMarkdownRenderer {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  });

  markdown.inline.ruler.before('link', 'vault-wikilink', parseWikiLink);
  markdown.core.ruler.push('vault-source-lines', state => {
    for (const token of state.tokens) {
      if (!token.map || !token.tag || token.nesting < 0) continue;
      token.attrSet('data-source-line-start', String(token.map[0] + 1));
      token.attrSet('data-source-line-end', String(token.map[1]));
    }
  });

  return {
    render: source => markdown.render(source),
  };
}

function parseWikiLink(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (state.src.slice(start, start + 2) !== '[[') return false;
  if (start > 0 && state.src[start - 1] === '!') return false;

  const close = state.src.indexOf(']]', start + 2);
  if (close < 0 || close >= state.posMax) return false;

  const inner = state.src.slice(start + 2, close);
  if (!inner || inner.includes('\n')) return false;

  const separator = inner.indexOf('|');
  const targetWithHeading = (
    separator < 0 ? inner : inner.slice(0, separator)
  ).trim();
  const target = targetWithHeading.split('#', 1)[0].trim();
  const label = (
    separator < 0 ? targetWithHeading : inner.slice(separator + 1)
  ).trim();
  if (!target || !label) return false;

  if (!silent) {
    const open = state.push('link_open', 'a', 1);
    open.attrSet('href', `#vault-note=${encodeURIComponent(target)}`);
    open.attrSet('data-vault-note', target);

    const text = state.push('text', '', 0);
    text.content = label;
    state.push('link_close', 'a', -1);
  }

  state.pos = close + 2;
  return true;
}
