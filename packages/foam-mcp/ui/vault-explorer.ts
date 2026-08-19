import { App } from '@modelcontextprotocol/ext-apps';
import MarkdownIt from 'markdown-it';
import '@foam/graph-view';

interface VaultFile {
  uri: string;
  title: string;
  type: string;
  tags: string[];
}

interface VaultSummary {
  id: string;
  name: string;
  path: string;
  last_opened_at: number;
  active: boolean;
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
  active_vault: VaultSummary | null;
  vaults: VaultSummary[];
  files: VaultFile[];
  graph: GraphData;
  summary: { note_count: number; connection_count: number };
  needs_vault_selection: boolean;
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

type VaultDialogMode = 'register' | 'create';

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

const shellElement = query<HTMLElement>('#shell');
const graphElement = query<FoamGraphElement>('#graph');
const treeElement = query<HTMLDivElement>('#tree');
const markdownElement = query<HTMLDivElement>('#markdown');
const backlinksElement = query<HTMLElement>('#backlinks');
const backlinkListElement = query<HTMLDivElement>('#backlink-list');
const noteTitleElement = query<HTMLSpanElement>('#note-title');
const notePathElement = query<HTMLSpanElement>('#note-path');
const statusElement = query<HTMLDivElement>('#status');
const fileCountElement = query<HTMLSpanElement>('#file-count');
const searchElement = query<HTMLInputElement>('#search');
const vaultNameElement = query<HTMLSpanElement>('#vault-name');
const vaultPathElement = query<HTMLSpanElement>('#vault-path');
const vaultMenuElement = query<HTMLDivElement>('#vault-menu');
const emptyVaultElement = query<HTMLElement>('#empty-vault');
const vaultDialog = query<HTMLDialogElement>('#vault-dialog');
const vaultDialogTitle = query<HTMLElement>('#vault-dialog-title');
const vaultForm = query<HTMLFormElement>('#vault-form');
const pathField = query<HTMLLabelElement>('#path-field');
const pathInput = query<HTMLInputElement>('#vault-folder-path');
const nameField = query<HTMLLabelElement>('#name-field');
const nameInput = query<HTMLInputElement>('#vault-folder-name');
const dialogErrorElement = query<HTMLDivElement>('#dialog-error');
const vaultSwitcherElement = query<HTMLButtonElement>('#vault-switcher');

let payload: ExplorerPayload | null = null;
let activeUri: string | null = null;
let visibleFiles: VaultFile[] = [];
let searchTimer: number | undefined;
let searchSequence = 0;
let noteSequence = 0;
let dialogMode: VaultDialogMode = 'register';

graphElement.showControls = true;
graphElement.maxFitZoom = 2.2;
graphElement.labels = { fade: 0.15 };
graphElement.selection = {
  neighborDepth: 1,
  centerOnSelect: true,
  zoomOnSelect: true,
};

function applyTheme(theme: string | undefined): void {
  const resolved = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = resolved;
  const dark = resolved === 'dark';
  graphElement.graphStyle = {
    colorMode: 'directory',
    style: {
      background: 'transparent',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineColor: dark ? '#4a4a4a' : '#c7c4bd',
      highlightedForeground: dark ? '#f3f3f3' : '#1d1d1f',
      node: {
        note: dark ? '#a68af9' : '#7056c9',
        placeholder: dark ? '#77736f' : '#aaa59e',
        tag: dark ? '#54d987' : '#2f9d61',
      },
    },
  };
}

function isExplorerPayload(value: unknown): value is ExplorerPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExplorerPayload>;
  return (
    Array.isArray(candidate.vaults) &&
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
  const vaultChanged = payload?.active_vault?.id !== next.active_vault?.id;
  payload = next;
  graphElement.graphData = next.graph;
  emptyVaultElement.hidden = !next.needs_vault_selection;

  if (vaultChanged) {
    activeUri = null;
    searchElement.value = '';
    searchSequence += 1;
  }

  renderVault(next);
  renderFileTree(next.files);
  setStatus(
    `${next.summary.note_count} 則筆記 · ${next.summary.connection_count} 條連結`
  );

  const requested = next.focus_uri;
  if (requested && next.files.some(file => file.uri === requested)) {
    void openNote(requested);
  } else if (!activeUri && next.files[0]) {
    void openNote(next.files[0].uri);
  } else if (activeUri && !next.files.some(file => file.uri === activeUri)) {
    activeUri = null;
    showEmptyDocument('從檔案列表或圖譜選擇一則筆記。');
  }
}

function renderVault(next: ExplorerPayload): void {
  const active = next.active_vault;
  vaultNameElement.textContent = active?.name ?? '選擇知識庫';
  vaultPathElement.textContent = active?.path ?? '尚未開啟 Vault';
  vaultPathElement.title = active?.path ?? '';

  vaultMenuElement.replaceChildren();
  for (const vault of next.vaults) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `vault-option${vault.active ? ' active' : ''}`;
    const name = document.createElement('span');
    name.className = 'vault-option-name';
    name.textContent = vault.name;
    const pathLabel = document.createElement('span');
    pathLabel.className = 'vault-option-path';
    pathLabel.textContent = vault.path;
    button.append(name, pathLabel);
    button.addEventListener('click', () => void switchVault(vault.id));
    vaultMenuElement.append(button);
  }

  if (next.vaults.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'menu-divider';
    vaultMenuElement.append(divider);
  }
  vaultMenuElement.append(
    createMenuAction('開啟其他資料夾…', () => openVaultDialog('register')),
    createMenuAction('建立新知識庫…', () => openVaultDialog('create'))
  );
}

function createMenuAction(
  label: string,
  action: () => void
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'vault-action';
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
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
  visibleFiles = files;
  treeElement.replaceChildren();
  fileCountElement.textContent = String(files.length);
  renderTreeNode(createTree(files), treeElement, true);
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
    button.textContent = file.title || file.uri.split('/').at(-1) || file.uri;
    button.title = file.uri;
    button.addEventListener('click', () => void openNote(file.uri));
    parent.append(button);
  }

  if (isRoot && directoryEntries.length === 0 && sortedFiles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = payload?.needs_vault_selection
      ? '請先選擇知識庫。'
      : '沒有符合的筆記。';
    parent.append(empty);
  }
}

async function openNote(uri: string): Promise<void> {
  if (!payload) return;
  const sequence = ++noteSequence;
  activeUri = uri;
  const file = payload.files.find(item => item.uri === uri);
  noteTitleElement.textContent = file?.title ?? uri;
  notePathElement.textContent = uri;
  notePathElement.title = uri;
  renderFileTree(visibleFiles);
  graphElement.selectNote(uri);
  showEmptyDocument('正在讀取筆記…');
  backlinksElement.hidden = true;

  try {
    const [resourceResult, connectionResult] = await Promise.all([
      app.callServerTool({ name: 'read_resource', arguments: { uri } }),
      app.callServerTool({
        name: 'get_connections',
        arguments: { uri, direction: 'both' },
      }),
    ]);
    if (sequence !== noteSequence) return;
    const resource = parseToolJson<{ content: string }>(resourceResult);
    const connections = parseToolJson<{
      backlinks: Array<{ uri: string; title: string }>;
    }>(connectionResult);
    renderMarkdown(resource.content);
    renderBacklinks(connections.backlinks);
    await updateSelectedNoteContext(uri);
  } catch (error) {
    if (sequence !== noteSequence) return;
    showEmptyDocument(errorMessage(error));
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

function showEmptyDocument(message: string): void {
  markdownElement.classList.add('empty');
  markdownElement.textContent = message;
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
  return label.replace(/[\\[\]]/g, character => `\\${character}`);
}

function renderBacklinks(
  backlinks: Array<{ uri: string; title: string }>
): void {
  backlinkListElement.replaceChildren();
  backlinksElement.hidden = backlinks.length === 0;
  for (const backlink of backlinks) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'backlink';
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

async function updateSelectedNoteContext(uri: string): Promise<void> {
  try {
    await app.updateModelContext({
      content: [
        {
          type: 'text',
          text: `Codex Vault 目前在「${
            payload?.active_vault?.name ?? 'Vault'
          }」選取的筆記：${uri}`,
        },
      ],
      structuredContent: {
        selected_vault_id: payload?.active_vault?.id,
        selected_vault_note: uri,
      },
    });
  } catch {
    // Host context updates are optional; note reading remains available.
  }
}

async function runSearch(queryText: string): Promise<void> {
  const sequence = ++searchSequence;
  if (!payload || !queryText.trim()) {
    if (payload) renderFileTree(payload.files);
    setStatus(
      payload
        ? `${payload.summary.note_count} 則筆記 · ${payload.summary.connection_count} 條連結`
        : '正在載入知識庫…'
    );
    return;
  }

  setStatus('搜尋 Markdown 正文中…');
  try {
    const result = await app.callServerTool({
      name: 'search_resources',
      arguments: { query: queryText, limit: 80 },
    });
    if (sequence !== searchSequence || !payload) return;
    const matches = parseToolJson<Array<{ uri: string }>>(result);
    const matchedUris = new Set(matches.map(match => match.uri));
    const files = payload.files.filter(file => matchedUris.has(file.uri));
    renderFileTree(files);
    setStatus(`找到 ${files.length} 則筆記`);
  } catch (error) {
    if (sequence !== searchSequence) return;
    setStatus(errorMessage(error), true);
  }
}

async function switchVault(vaultId: string): Promise<void> {
  closeVaultMenu();
  setStatus('正在切換知識庫…');
  try {
    const result = await app.callServerTool({
      name: 'select_vault',
      arguments: { vault_id: vaultId },
    });
    parseToolJson(result);
    await refreshExplorerState();
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

async function refreshExplorerState(): Promise<void> {
  const result = await app.callServerTool({
    name: 'get_vault_explorer_state',
    arguments: {},
  });
  setExplorerPayload(parseToolJson<ExplorerPayload>(result));
}

function openVaultDialog(mode: VaultDialogMode): void {
  closeVaultMenu();
  dialogMode = mode;
  vaultForm.reset();
  dialogErrorElement.textContent = '';
  const creating = mode === 'create';
  vaultDialogTitle.textContent = creating
    ? '建立新知識庫'
    : '開啟資料夾作為知識庫';
  pathField.querySelector('span')!.textContent = creating
    ? '上層資料夾路徑'
    : '知識庫資料夾路徑';
  nameField.hidden = !creating;
  nameInput.required = creating;
  pathInput.placeholder = creating
    ? '/Users/name/Documents'
    : '/Users/name/Documents/My Vault';
  if (typeof vaultDialog.showModal === 'function') vaultDialog.showModal();
  else vaultDialog.setAttribute('open', '');
  pathInput.focus();
}

async function submitVaultDialog(): Promise<void> {
  const pathValue = pathInput.value.trim();
  const nameValue = nameInput.value.trim();
  if (!pathValue || (dialogMode === 'create' && !nameValue)) return;
  dialogErrorElement.textContent = '';

  try {
    const result = await app.callServerTool(
      dialogMode === 'create'
        ? {
            name: 'create_vault',
            arguments: { parent_path: pathValue, name: nameValue },
          }
        : {
            name: 'register_vault',
            arguments: { path: pathValue },
          }
    );
    parseToolJson(result);
    closeVaultDialog();
    await refreshExplorerState();
  } catch (error) {
    dialogErrorElement.textContent = errorMessage(error);
  }
}

function closeVaultDialog(): void {
  if (typeof vaultDialog.close === 'function') vaultDialog.close();
  else vaultDialog.removeAttribute('open');
}

function toggleVaultMenu(): void {
  vaultMenuElement.hidden = !vaultMenuElement.hidden;
}

function closeVaultMenu(): void {
  vaultMenuElement.hidden = true;
}

function setStatus(message: string, error = false): void {
  statusElement.textContent = message;
  statusElement.classList.toggle('error', error);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function requestFullscreen(): Promise<void> {
  const context = app.getHostContext();
  if (!context?.availableDisplayModes?.includes('fullscreen')) return;
  try {
    await app.requestDisplayMode({ mode: 'fullscreen' });
  } catch {
    // Inline mode remains usable when the host declines fullscreen.
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

vaultSwitcherElement.addEventListener('click', toggleVaultMenu);
query<HTMLButtonElement>('#toggle-sidebar').addEventListener('click', event => {
  const hidden = shellElement.classList.toggle('sidebar-hidden');
  (event.currentTarget as HTMLButtonElement).classList.toggle(
    'active',
    !hidden
  );
});
query<HTMLButtonElement>('#toggle-graph').addEventListener('click', event => {
  const hidden = shellElement.classList.toggle('graph-hidden');
  (event.currentTarget as HTMLButtonElement).classList.toggle(
    'active',
    !hidden
  );
});
query<HTMLButtonElement>('#open-existing').addEventListener('click', () =>
  openVaultDialog('register')
);
query<HTMLButtonElement>('#create-new').addEventListener('click', () =>
  openVaultDialog('create')
);
query<HTMLButtonElement>('#dialog-cancel').addEventListener(
  'click',
  closeVaultDialog
);
vaultForm.addEventListener('submit', event => {
  event.preventDefault();
  void submitVaultDialog();
});
document.addEventListener('click', event => {
  const target = event.target as Node;
  if (
    !vaultMenuElement.contains(target) &&
    !vaultSwitcherElement.contains(target)
  ) {
    closeVaultMenu();
  }
});

app.ontoolresult = receiveToolResult;
app.onhostcontextchanged = context => applyTheme(context.theme);

void app.connect().then(() => {
  applyTheme(app.getHostContext()?.theme);
  void requestFullscreen();
});
