import { describe, expect, it } from 'vitest';
import {
  createTree,
  filterGraphData,
  resolveWikiTarget,
  type GraphData,
  type VaultFile,
} from './vault-explorer-model';

const files: VaultFile[] = [
  { uri: 'root.md', title: 'Root', type: 'note', tags: [] },
  {
    uri: 'folder/child.md',
    title: 'Child',
    type: 'note',
    tags: ['topic'],
  },
];

const graph: GraphData = {
  nodeInfo: {
    'root.md': {
      id: 'root.md',
      type: 'note',
      title: 'Root',
      properties: {},
      tags: [],
    },
    'folder/child.md': {
      id: 'folder/child.md',
      type: 'note',
      title: 'Child',
      properties: {},
      tags: [],
    },
    'orphan.md': {
      id: 'orphan.md',
      type: 'note',
      title: 'Orphan',
      properties: {},
      tags: [],
    },
    'broken-only.md': {
      id: 'broken-only.md',
      type: 'note',
      title: 'Broken only',
      properties: {},
      tags: [],
    },
    missing: {
      id: 'missing',
      type: 'placeholder',
      title: 'missing',
      properties: {},
      tags: [],
    },
    'missing-two': {
      id: 'missing-two',
      type: 'placeholder',
      title: 'missing-two',
      properties: {},
      tags: [],
    },
  },
  links: [
    { source: 'root.md', target: 'folder/child.md' },
    { source: 'root.md', target: 'missing' },
    { source: 'broken-only.md', target: 'missing-two' },
  ],
};

describe('vault explorer model', () => {
  it('builds a nested file tree without changing file order', () => {
    const tree = createTree(files);
    expect(tree.files).toEqual([files[0]]);
    expect(tree.directories.get('folder')?.files).toEqual([files[1]]);
  });

  it('filters unresolved and disconnected graph nodes consistently', () => {
    const filtered = filterGraphData(graph, {
      query: '',
      showOrphans: false,
      showUnresolved: false,
    });
    expect(Object.keys(filtered.nodeInfo).sort()).toEqual([
      'folder/child.md',
      'root.md',
    ]);
    expect(filtered.links).toEqual([
      { source: 'root.md', target: 'folder/child.md' },
    ]);
  });

  it('filters graph nodes by title or path', () => {
    expect(
      Object.keys(
        filterGraphData(graph, {
          query: 'folder/',
          showOrphans: true,
          showUnresolved: true,
        }).nodeInfo
      )
    ).toEqual(['folder/child.md']);
  });

  it('resolves Obsidian wikilink targets', () => {
    expect(resolveWikiTarget(files, 'child')?.uri).toBe('folder/child.md');
  });
});
