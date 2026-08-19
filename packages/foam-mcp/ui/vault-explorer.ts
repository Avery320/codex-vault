import { App } from '@modelcontextprotocol/ext-apps';
import MarkdownIt from 'markdown-it';
import '@foam/graph-view';

interface VaultFile {
  uri: string;
  title: string;
  type: string;
  tags: string[];
}

interface GraphData {
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

interface ExplorerPayload {
  focus_uri?: string;
  files: VaultFile[];
  graph: GraphData;
  summary: { note_count: number; connection_count: number };
}

interface FoamGraphElement extends HTMLElement {
  graphData: GraphData | null;
  graphStyle: Record<string, unknown> | null;
  showControls: boolean;
  maxFitZoom: number | null;
  labels: { fade: number };
  selection: {
    neighborDepth: number;
    centerOnSelect: boolean;
    zoomOnSelect: boolean;
  };
  selectNote(noteId: string): void;
}

interface ToolResultLike {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
}

interface TreeNode {
  directories: Map<string, TreeNode>;
  files: VaultFile[];
}

const app = new App(
  { name: 'Codex Vault Explorer', version: '0.1.0' },
  {},
  { autoResize: false }
);
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

const graphElement = query<FoamGraphElement>('#graph');
const treeElement = query<HTMLDivElement>('#tree');
const markdownElement = query<HTMLDivElement>('#markdown');
const backlinksElement = query<HTMLElement>('#backlinks');
const backlinkListElement = query<HTMLDivElement>('#backlink-list');
const notePathElement = query<HTMLSpanElement>('#note-path');
const statsElement = query<HTMLDivElement>('#stats');
const fileCountElement = query<HTMLSpanElement>('#file-count');
const searchElement = query<HTMLInputElement>('#search');
const workspaceElement = query<HTMLElement>('#workspace');

let payload: ExplorerPayload | null = null;
let activeUri: string | null = null;
let searchTimer: number | undefined;
let searchSequence = 0;

graphElement.showControls = true;
graphElement.maxFitZoom = 2.2;
graphElement.labels = { fade: 0.15 };
graphElement.selection = {
  neighborDepth: 1,
  centerOnSelect: true,
  zoomOnSelect: true,
};

function applyTheme(theme: string | undefined): void {
  const resolved = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = resolved;
  const dark = resolved === 'dark';
  graphElement.graphStyle = {
    colorMode: 'directory',
    style: {
      background: 'transparent',
      fontFamily: 'Inter, ui-sans-serif, sans-serif',
      lineColor: dark ? '#575754' : '#c7c7c1',
      highlightedForeground: dark ? '#ffffff' : '#111111',
      node: {
        note: dark ? '#82aaff' : '#2563eb',
        placeholder: dark ? '#706f6a' : '#aaa9a2',
        tag: dark ? '#c792ea' : '#7c3aed',
      },
    },
  };
}

function isExplorerPayload(value: unknown): value is ExplorerPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExplorerPayload>;
  return (
    Array.isArray(candidate.files) &&
    !!candidate.graph &&
    typeof candidate.graph === 'object' &&
    !!candidate.summary
  );
}

function receiveToolResult(result: ToolResultLike): void {
  if (isExplorerPayload(result.structuredContent)) {
    setExplorerPayload(result.structuredContent);
  }
}

function setExplorerPayload(next: ExplorerPayload): void {
  payload = next;
  graphElement.graphData = next.graph;
  statsElement.textContent = `${next.summary.note_count} 則筆記 · ${next.summary.connection_count} 條連結`;
  renderFileTree(next.files);

  const requested = next.focus_uri;
  if (requested && next.files.some(file => file.uri === requested)) {
    void openNote(requested);
  } else if (!activeUri && next.files[0]) {
    void openNote(next.files[0].uri);
  }
}

function createTree(files: VaultFile[]): TreeNode {
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

function renderFileTree(files: VaultFile[]): void {
  treeElement.replaceChildren();
  fileCountElement.textContent = String(files.length);
  const root = createTree(files);
  renderTreeNode(root, treeElement, true);
}

function renderTreeNode(
  node: TreeNode,
  parent: HTMLElement,
  isRoot = false
): void {
  const directoryEntries = Array.from(node.directories.entries()).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  for (const [name, child] of directoryEntries) {
    const details = document.createElement('details');
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = name;
    const content = document.createElement('div');
    content.className = 'folder-content';
    renderTreeNode(child, content);
    details.append(summary, content);
    parent.append(details);
  }

  const sortedFiles = [...node.files].sort((left, right) =>
    left.title.localeCompare(right.title)
  );
  for (const file of sortedFiles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `file${file.uri === activeUri ? ' active' : ''}`;
    button.dataset.uri = file.uri;
    const icon = document.createElement('span');
    icon.textContent = '◇';
    const label = document.createElement('span');
    label.className = 'file-label';
    label.textContent = file.title || file.uri.split('/').at(-1) || file.uri;
    button.append(icon, label);
    button.addEventListener('click', () => void openNote(file.uri));
    parent.append(button);
  }

  if (isRoot && directoryEntries.length === 0 && sortedFiles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '沒有符合的筆記。';
    parent.append(empty);
  }
}

async function openNote(uri: string): Promise<void> {
  if (!payload) return;
  activeUri = uri;
  notePathElement.textContent = uri;
  renderFileTree(currentVisibleFiles());
  graphElement.selectNote(uri);
  markdownElement.classList.add('empty');
  markdownElement.textContent = '正在讀取筆記…';
  backlinksElement.hidden = true;

  try {
    const [resourceResult, connectionResult] = await Promise.all([
      app.callServerTool({ name: 'read_resource', arguments: { uri } }),
      app.callServerTool({
        name: 'get_connections',
        arguments: { uri, direction: 'both' },
      }),
    ]);
    const resource = parseToolJson<{ content: string }>(resourceResult);
    const connections = parseToolJson<{
      backlinks: Array<{ uri: string; title: string }>;
    }>(connectionResult);
    renderMarkdown(resource.content);
    renderBacklinks(connections.backlinks);
    await updateSelectedNoteContext(uri);
  } catch (error) {
    markdownElement.classList.add('empty');
    markdownElement.textContent =
      error instanceof Error ? error.message : String(error);
  }
}

function parseToolJson<T>(result: ToolResultLike): T {
  const text = result.content?.find(item => item.type === 'text')?.text;
  if (result.isError || !text) {
    throw new Error(text ?? '工具沒有傳回可讀取的內容。');
  }
  return JSON.parse(text) as T;
}

function renderMarkdown(source: string): void {
  markdownElement.classList.remove('empty');
  markdownElement.innerHTML = markdown.render(convertWikiLinks(source));
}

function convertWikiLinks(source: string): string {
  return source.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    const [targetWithHeading, customLabel] = inner.split('|');
    const target = targetWithHeading.split('#')[0].trim();
    const label = (customLabel ?? targetWithHeading).trim();
    return `[${escapeMarkdownLabel(label)}](#vault-note=${encodeURIComponent(
      target
    )})`;
  });
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/[\\\[\]]/g, character => `\\${character}`);
}

function renderBacklinks(
  backlinks: Array<{ uri: string; title: string }>
): void {
  backlinkListElement.replaceChildren();
  backlinksElement.hidden = backlinks.length === 0;
  for (const backlink of backlinks) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = backlink.title;
    button.addEventListener('click', () => void openNote(backlink.uri));
    backlinkListElement.append(button);
  }
}

function resolveWikiTarget(target: string): VaultFile | undefined {
  if (!payload) return undefined;
  const withoutExtension = (value: string) => value.replace(/\.md$/i, '');
  const normalizedTarget = withoutExtension(target).toLocaleLowerCase();
  return payload.files.find(file => {
    const uri = withoutExtension(file.uri).toLocaleLowerCase();
    const basename = uri.split('/').at(-1);
    return (
      uri === normalizedTarget ||
      basename === normalizedTarget ||
      file.title.toLocaleLowerCase() === normalizedTarget
    );
  });
}

function currentVisibleFiles(): VaultFile[] {
  if (!payload) return [];
  const visibleUris = new Set(
    Array.from(treeElement.querySelectorAll<HTMLElement>('.file')).map(
      item => item.dataset.uri
    )
  );
  if (!searchElement.value.trim() || visibleUris.size === 0)
    return payload.files;
  return payload.files.filter(file => visibleUris.has(file.uri));
}

async function updateSelectedNoteContext(uri: string): Promise<void> {
  try {
    await app.updateModelContext({
      content: [
        {
          type: 'text',
          text: `Codex Vault Explorer 目前選取的筆記：${uri}`,
        },
      ],
      structuredContent: { selected_vault_note: uri },
    });
  } catch {
    // Context updates are optional for hosts; reading still works without it.
  }
}

async function runSearch(queryText: string): Promise<void> {
  const sequence = ++searchSequence;
  if (!payload || !queryText.trim()) {
    if (payload) renderFileTree(payload.files);
    statsElement.textContent = payload
      ? `${payload.summary.note_count} 則筆記 · ${payload.summary.connection_count} 條連結`
      : '正在載入知識庫…';
    return;
  }

  statsElement.textContent = '搜尋 Markdown 正文中…';
  try {
    const result = await app.callServerTool({
      name: 'search_resources',
      arguments: { query: queryText, limit: 80 },
    });
    if (sequence !== searchSequence) return;
    const matches = parseToolJson<Array<{ uri: string }>>(result);
    const matchedUris = new Set(matches.map(match => match.uri));
    const files = payload.files.filter(file => matchedUris.has(file.uri));
    renderFileTree(files);
    statsElement.textContent = `找到 ${files.length} 則筆記`;
  } catch (error) {
    statsElement.textContent =
      error instanceof Error ? error.message : String(error);
  }
}

async function requestFullscreen(): Promise<void> {
  const context = app.getHostContext();
  if (!context?.availableDisplayModes?.includes('fullscreen')) return;
  try {
    await app.requestDisplayMode({ mode: 'fullscreen' });
  } catch {
    // The app remains usable inline if the host declines fullscreen.
  }
}

async function askCodexToAnalyze(): Promise<void> {
  if (!activeUri) return;
  await updateSelectedNoteContext(activeUri);
  try {
    await app.sendMessage({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `請分析我目前在 Codex Vault 中查看的筆記「${activeUri}」，整理重點、相關連結與可執行的下一步。`,
        },
      ],
    });
  } catch (error) {
    statsElement.textContent =
      error instanceof Error ? error.message : String(error);
  }
}

searchElement.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(
    () => void runSearch(searchElement.value),
    220
  );
});

markdownElement.addEventListener('click', event => {
  const anchor = (event.target as Element).closest<HTMLAnchorElement>('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href') ?? '';
  if (href.startsWith('#vault-note=')) {
    event.preventDefault();
    const target = decodeURIComponent(href.slice('#vault-note='.length));
    const file = resolveWikiTarget(target);
    if (file) void openNote(file.uri);
    return;
  }
  if (/^https?:\/\//.test(anchor.href)) {
    event.preventDefault();
    void app.openLink({ url: anchor.href });
  }
});

graphElement.addEventListener('node-click', event => {
  const uri = (event as CustomEvent<string>).detail;
  if (payload?.files.some(file => file.uri === uri)) void openNote(uri);
});

query<HTMLButtonElement>('#fullscreen').addEventListener(
  'click',
  () => void requestFullscreen()
);
query<HTMLButtonElement>('#analyze').addEventListener(
  'click',
  () => void askCodexToAnalyze()
);
query<HTMLButtonElement>('#toggle-view').addEventListener('click', event => {
  const showGraph = workspaceElement.classList.toggle('show-graph');
  (event.currentTarget as HTMLButtonElement).textContent = showGraph
    ? '閱讀'
    : '圖譜';
});

app.ontoolresult = receiveToolResult;
app.onhostcontextchanged = context => applyTheme(context.theme);

void app.connect().then(() => {
  applyTheme(app.getHostContext()?.theme);
  void requestFullscreen();
});
