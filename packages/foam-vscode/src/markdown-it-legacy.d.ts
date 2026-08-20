import type MarkdownIt from 'markdown-it';

/**
 * Temporary type bridge for the legacy preview sources.
 *
 * @types/markdown-it v12 exposed `markdownit` globally. The current v14 types
 * use module exports instead. Keeping the alias inside the legacy package lets
 * the renderer algorithms use one current type version while the extension is
 * being removed.
 */
declare global {
  type markdownit = MarkdownIt;
}

export {};
