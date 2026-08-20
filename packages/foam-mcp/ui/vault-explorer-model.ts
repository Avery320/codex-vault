export interface VaultFile {
  uri: string;
  title: string;
  type: string;
  tags: string[];
}

export interface GraphData {
  nodeInfo: Record<
    string,
    {
      id: string;
      type: string;
      title: string;
      properties: Record<string, unknown>;
      tags: Array<{ label: string }>;
    }
  >;
  links: Array<{ source: string; target: string }>;
}

export interface GraphFilters {
  query: string;
  showOrphans: boolean;
  showUnresolved: boolean;
}

export interface TreeNode {
  directories: Map<string, TreeNode>;
  files: VaultFile[];
}

export function createTree(files: VaultFile[]): TreeNode {
  const root: TreeNode = { directories: new Map(), files: [] };
  for (const file of files) {
    const segments = file.uri.split('/');
    let node = root;
    for (const directory of segments.slice(0, -1)) {
      let child = node.directories.get(directory);
      if (!child) {
        child = { directories: new Map(), files: [] };
        node.directories.set(directory, child);
      }
      node = child;
    }
    node.files.push(file);
  }
  return root;
}

export function filterGraphData(
  graph: GraphData,
  filters: GraphFilters
): GraphData {
  const query = filters.query.trim().toLocaleLowerCase();
  const candidateIds = new Set(
    Object.values(graph.nodeInfo)
      .filter(node => filters.showUnresolved || node.type !== 'placeholder')
      .filter(
        node =>
          !query ||
          node.title.toLocaleLowerCase().includes(query) ||
          node.id.toLocaleLowerCase().includes(query)
      )
      .map(node => node.id)
  );
  const links = graph.links.filter(
    link => candidateIds.has(link.source) && candidateIds.has(link.target)
  );
  const visibleIds = filters.showOrphans ? candidateIds : new Set<string>();
  if (!filters.showOrphans) {
    for (const link of links) {
      visibleIds.add(link.source);
      visibleIds.add(link.target);
    }
  }

  return {
    nodeInfo: Object.fromEntries(
      Object.entries(graph.nodeInfo).filter(([id]) => visibleIds.has(id))
    ),
    links,
  };
}

export function convertWikiLinks(source: string): string {
  return source.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    const [targetWithHeading, customLabel] = inner.split('|');
    const target = targetWithHeading.split('#')[0].trim();
    const label = (customLabel ?? targetWithHeading).trim();
    return `[${escapeMarkdownLabel(label)}](#vault-note=${encodeURIComponent(
      target
    )})`;
  });
}

export function resolveWikiTarget(
  files: VaultFile[],
  target: string
): VaultFile | undefined {
  const withoutExtension = (value: string) => value.replace(/\.md$/i, '');
  const normalizedTarget = withoutExtension(target).toLocaleLowerCase();
  return files.find(file => {
    const uri = withoutExtension(file.uri).toLocaleLowerCase();
    const basename = uri.split('/').at(-1);
    return (
      uri === normalizedTarget ||
      basename === normalizedTarget ||
      file.title.toLocaleLowerCase() === normalizedTarget
    );
  });
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/[\\[\]]/g, character => `\\${character}`);
}
