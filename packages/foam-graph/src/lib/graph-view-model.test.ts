import { describe, expect, it } from 'vitest';
import { makeGraph, makeStyle } from '../test-utils';
import { createGraphModel } from './graph-utils';
import {
  computeVisibleGraph,
  deriveNodeTypeFilters,
} from './graph-view-model';

describe('deriveNodeTypeFilters', () => {
  it('keeps tag nodes available after graph model creation', () => {
    const graph = createGraphModel(
      makeGraph({
        nodeInfo: {
          note: {
            id: 'note',
            type: 'note',
            title: 'Note',
            properties: {},
            tags: [{ label: 'topic' }],
          },
        },
      })
    );

    const filters = deriveNodeTypeFilters(graph, makeStyle(), {});

    expect(filters.tag).toBe(true);
  });

  it('defaults images and attachments to hidden and other builtins to visible', () => {
    const graph = createGraphModel(
      makeGraph({
        nodeInfo: {
          note: { id: 'note', type: 'note', title: 'Note', properties: {}, tags: [] },
          image: { id: 'image', type: 'image', title: 'Image', properties: {}, tags: [] },
          attachment: {
            id: 'attachment',
            type: 'attachment',
            title: 'Attachment',
            properties: {},
            tags: [],
          },
          placeholder: {
            id: 'placeholder',
            type: 'placeholder',
            title: 'Placeholder',
            properties: {},
            tags: [],
          },
        },
      })
    );

    const filters = deriveNodeTypeFilters(graph, makeStyle(), {});

    expect(filters).toMatchObject({
      note: true,
      image: false,
      attachment: false,
      placeholder: true,
    });
  });

  it('preserves configured visibility and adds styled custom types', () => {
    const graph = createGraphModel(
      makeGraph({
        nodeInfo: {
          article: {
            id: 'article',
            type: 'article',
            title: 'Article',
            properties: {},
            tags: [],
          },
        },
      })
    );

    const filters = deriveNodeTypeFilters(
      graph,
      makeStyle({ node: { note: '#00f', placeholder: '#333', tag: '#ff0', book: '#0f0' } }),
      { article: false, stale: true }
    );

    expect(filters.article).toBe(false);
    expect(filters.book).toBe(true);
    expect(filters.stale).toBeUndefined();
  });
});

describe('computeVisibleGraph', () => {
  it('returns only enabled node types and their links', () => {
    const graph = createGraphModel(
      makeGraph({
        nodeInfo: {
          a: { id: 'a', type: 'note', title: 'A', properties: {}, tags: [] },
          b: { id: 'b', type: 'image', title: 'B', properties: {}, tags: [] },
          c: { id: 'c', type: 'note', title: 'C', properties: {}, tags: [] },
        },
        links: [
          { source: 'a', target: 'b' },
          { source: 'a', target: 'c' },
        ],
      })
    );

    const visible = computeVisibleGraph(graph, { note: true, image: false });

    expect(visible.nodes.map(node => node.id).sort()).toEqual(['a', 'c']);
    expect(visible.links).toEqual([{ source: 'a', target: 'c' }]);
  });
});
