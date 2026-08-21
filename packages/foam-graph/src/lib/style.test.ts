import { describe, it, expect } from 'vitest';
import { resolveStyle } from './style';
import { makeStyle } from '../test-utils';

describe('resolveStyle', () => {
  const defaults = makeStyle();

  it('returns defaults when payload is null', () => {
    expect(resolveStyle(null, defaults)).toEqual(defaults);
  });

  it('applies background from payload.style', () => {
    const result = resolveStyle({ style: { background: '#ff0000' } }, defaults);
    expect(result.background).toBe('#ff0000');
  });

  it('leaves other defaults untouched when only one property is overridden', () => {
    const result = resolveStyle({ style: { background: '#ff0000' } }, defaults);
    expect(result.fontSize).toBe(defaults.fontSize);
    expect(result.lineColor).toBe(defaults.lineColor);
    expect(result.node).toEqual(defaults.node);
  });

  it('applies font settings from payload.style', () => {
    const result = resolveStyle(
      { style: { fontSize: 16, fontFamily: 'Monospace' } },
      defaults
    );
    expect(result.fontSize).toBe(16);
    expect(result.fontFamily).toBe('Monospace');
  });

  it('applies node colors from payload.style.node', () => {
    const result = resolveStyle(
      { style: { node: { note: '#abcdef' } } },
      defaults
    );
    expect(result.node.note).toBe('#abcdef');
    expect(result.node.placeholder).toBe(defaults.node.placeholder);
  });

  it('uses explicit lineColor from payload.style', () => {
    const result = resolveStyle({ style: { lineColor: '#123456' } }, defaults);
    expect(result.lineColor).toBe('#123456');
  });

  it('falls back to node.note as lineColor when lineColor is not set', () => {
    const result = resolveStyle(
      { style: { node: { note: '#aabbcc' } } },
      defaults
    );
    expect(result.lineColor).toBe('#aabbcc');
  });

  it('applies colorMode from payload', () => {
    const result = resolveStyle({ colorMode: 'directory' }, defaults);
    expect(result.colorMode).toBe('directory');
  });

  it('keeps default colorMode when payload does not specify one', () => {
    const result = resolveStyle({ style: { background: '#ff0000' } }, defaults);
    expect(result.colorMode).toBe(defaults.colorMode);
  });
});
