import { App } from '@modelcontextprotocol/ext-apps';
import MarkdownIt from 'markdown-it';
import '@foam/graph-view';
import {
  convertWikiLinks,
  createTree,
  filterGraphData,
  resolveWikiTarget,
  type GraphData,
  type TreeNode,
  type VaultFile,
} from './vault-explorer-model';

interface VaultSummary {
  id: string;
  name: string;
  path: string;
  last_opened_at: number;
  active: boolean;
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
  graphScope: 'full' | { depth: number };
  focusNodeId: string | null;
  labels: { fade: number };
  forces: {
    collide: number;
    repel: number;
    link: number;
    velocityDecay: number;
  };
  nodeSizeMultiplier: number;
  linkWidthMultiplier: number;
  animateLinks: 'forward' | 'off' | 'reverse';
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

interface GraphPreferences {
  filterQuery: string;
  showOrphans: boolean;
  showUnresolved: boolean;
  textFade: number;
  nodeSize: number;
  linkWidth: number;
  repel: number;
  linkDistance: number;
  localDepth: number;
}

type VaultDialogMode = 'register' | 'create';
type GraphMode = 'global' | 'local';

const DEFAULT_GRAPH_PREFERENCES: GraphPreferences = {
  filterQuery: '',
  showOrphans: true,
  showUnresolved: false,
  textFade: 0,
  nodeSize: 1.5,
  linkWidth: 1,
  repel: 30,
  linkDistance: 36,
  localDepth: 1,
};

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
const graphWrapElement = query<HTMLDivElement>('#graph-wrap');
const graphSettingsElement = query<HTMLElement>('#graph-settings');
const graphSettingsToggleElement = query<HTMLButtonElement>(
  '#graph-settings-toggle'
);
const graphLocalToggleElement = query<HTMLButtonElement>('#graph-local-toggle');
const graphFilterElement = query<HTMLInputElement>('#graph-filter');
const graphShowOrphansElement = query<HTMLInputElement>('#graph-show-orphans');
const graphShowUnresolvedElement = query<HTMLInputElement>(
  '#graph-show-unresolved'
);
const graphTextFadeElement = query<HTMLInputElement>('#graph-text-fade');
const graphNodeSizeElement = query<HTMLInputElement>('#graph-node-size');
const graphLinkWidthElement = query<HTMLInputElement>('#graph-link-width');
const graphRepelElement = query<HTMLInputElement>('#graph-repel');
const graphLinkDistanceElement = query<HTMLInputElement>(
  '#graph-link-distance'
);
const graphDepthElement = query<HTMLInputElement>('#graph-depth');
const filesViewElement = query<HTMLButtonElement>('#toggle-sidebar');
const noteViewElement = query<HTMLButtonElement>('#show-note');
const graphViewElement = query<HTMLButtonElement>('#toggle-graph');

let payload: ExplorerPayload | null = null;
let activeUri: string | null = null;
let visibleFiles: VaultFile[] = [];
let searchTimer: number | undefined;
let searchSequence = 0;
let noteSequence = 0;
let dialogMode: VaultDialogMode = 'register';
let currentTheme = 'dark';
let graphMode: GraphMode = 'global';
let graphPreferences: GraphPreferences = { ...DEFAULT_GRAPH_PREFERENCES };
const singlePaneMedia = window.matchMedia('(max-width: 1000px)');
const mobileMedia = window.matchMedia('(max-width: 680px)');

graphElement.showControls = false;
graphElement.maxFitZoom = 2.2;
graphElement.selection = {
  neighborDepth: 1,
  centerOnSelect: false,
  zoomOnSelect: false,
};

function applyTheme(theme: string | undefined): void {
  const resolved = theme === 'light' ? 'light' : 'dark';
  currentTheme = resolved;
  document.documentElement.dataset.theme = resolved;
  applyGraphPreferences();
}

function applyGraphFilters(): void {
  graphElement.graphData = payload
    ? filterGraphData(payload.graph, {
        query: graphPreferences.filterQuery,
        showOrphans: graphPreferences.showOrphans,
        showUnresolved: graphPreferences.showUnresolved,
      })
    : null;
}

function applyGraphPreferences(): void {
  const dark = currentTheme === 'dark';
  graphElement.graphStyle = {
    colorMode: 'none',
    showNodesOfType: {
      note: true,
      placeholder: graphPreferences.showUnresolved,
      image: false,
      attachment: false,
    },
    style: {
      background: 'transparent',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineColor: dark ? '#565656' : '#b9b7b2',
      highlightedForeground: dark ? '#e3e3e3' : '#3f3f3f',
      node: {
        note: dark ? '#a8a8a8' : '#707070',
        placeholder: dark ? '#686868' : '#aaa8a3',
        tag: dark ? '#6fbd8c' : '#3e865b',
      },
    },
  };
  graphElement.labels = { fade: graphPreferences.textFade };
  graphElement.nodeSizeMultiplier = graphPreferences.nodeSize;
  graphElement.linkWidthMultiplier = graphPreferences.linkWidth;
  graphElement.animateLinks = 'off';
  graphElement.forces = {
    collide: 1,
    repel: graphPreferences.repel,
    link: graphPreferences.linkDistance,
    velocityDecay: 0.4,
  };
  applyGraphScope();
  syncGraphSettingsControls();
}

function applyGraphScope(): void {
  const local = graphMode === 'local' && activeUri !== null;
  graphElement.focusNodeId = local ? activeUri : null;
  graphElement.graphScope = local
    ? { depth: graphPreferences.localDepth }
    : 'full';
  graphLocalToggleElement.classList.toggle('active', local);
  graphLocalToggleElement.disabled = activeUri === null;
  graphLocalToggleElement.setAttribute('aria-pressed', String(local));
  graphLocalToggleElement.title = local ? '顯示全域圖譜' : '聚焦目前筆記';
}

function syncGraphSettingsControls(): void {
  graphFilterElement.value = graphPreferences.filterQuery;
  graphShowOrphansElement.checked = graphPreferences.showOrphans;
  graphShowUnresolvedElement.checked = graphPreferences.showUnresolved;
  graphTextFadeElement.value = String(graphPreferences.textFade);
  graphNodeSizeElement.value = String(graphPreferences.nodeSize);
  graphLinkWidthElement.value = String(graphPreferences.linkWidth);
  graphRepelElement.value = String(graphPreferences.repel);
  graphLinkDistanceElement.value = String(graphPreferences.linkDistance);
  graphDepthElement.value = String(graphPreferences.localDepth);
  query<HTMLOutputElement>('#graph-text-fade-value').value =
    graphPreferences.textFade.toFixed(1);
  query<HTMLOutputElement>(
    '#graph-node-size-value'
  ).value = `${graphPreferences.nodeSize.toFixed(1)}×`;
  query<HTMLOutputElement>(
    '#graph-link-width-value'
  ).value = `${graphPreferences.linkWidth.toFixed(1)}×`;
  query<HTMLOutputElement>('#graph-repel-value').value = String(
    graphPreferences.repel
  );
  query<HTMLOutputElement>('#graph-link-distance-value').value = String(
    graphPreferences.linkDistance
  );
  query<HTMLOutputElement>('#graph-depth-value').value = String(
    graphPreferences.localDepth
  );
}

function readGraphSettingsControls(): void {
  const previous = graphPreferences;
  graphPreferences = {
    filterQuery: graphFilterElement.value,
    showOrphans: graphShowOrphansElement.checked,
    showUnresolved: graphShowUnresolvedElement.checked,
    textFade: Number(graphTextFadeElement.value),
    nodeSize: Number(graphNodeSizeElement.value),
    linkWidth: Number(graphLinkWidthElement.value),
    repel: Number(graphRepelElement.value),
    linkDistance: Number(graphLinkDistanceElement.value),
    localDepth: Number(graphDepthElement.value),
  };
  if (
    previous.filterQuery !== graphPreferences.filterQuery ||
    previous.showOrphans !== graphPreferences.showOrphans ||
    previous.showUnresolved !== graphPreferences.showUnresolved
  ) {
    applyGraphFilters();
  }
  applyGraphPreferences();
}

function setGraphSettingsOpen(open: boolean): void {
  graphSettingsElement.hidden = !open;
  graphWrapElement.classList.toggle('settings-open', open);
  graphSettingsToggleElement.classList.toggle('active', open);
  graphSettingsToggleElement.setAttribute('aria-expanded', String(open));
  graphSettingsToggleElement.setAttribute(
    'aria-label',
    open ? '關閉圖譜設定' : '開啟圖譜設定'
  );
}

function setGraphMode(mode: GraphMode): void {
  if (mode === 'local' && activeUri === null) return;
  graphMode = mode;
  applyGraphScope();
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
  emptyVaultElement.hidden = !next.needs_vault_selection;

  if (vaultChanged) {
    activeUri = null;
    searchElement.value = '';
    searchSequence += 1;
  }

  renderVault(next);
  renderFileTree(next.files);
  applyGraphFilters();
  applyGraphPreferences();
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
  showWorkspacePane('reader');
  const sequence = ++noteSequence;
  activeUri = uri;
  const file = payload.files.find(item => item.uri === uri);
  noteTitleElement.textContent = file?.title ?? uri;
  notePathElement.textContent = uri;
  notePathElement.title = uri;
  renderFileTree(visibleFiles);
  applyGraphScope();
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

function showWorkspacePane(pane: 'reader' | 'graph'): void {
  shellElement.classList.toggle('showing-graph', pane === 'graph');
  shellElement.classList.remove('showing-files');
  syncRibbonState();
}

function showFilesView(): void {
  if (mobileMedia.matches) {
    shellElement.classList.add('showing-files');
  } else {
    shellElement.classList.toggle('sidebar-hidden');
  }
  syncRibbonState();
}

function showGraphView(): void {
  if (singlePaneMedia.matches) {
    showWorkspacePane('graph');
  } else {
    shellElement.classList.toggle('graph-hidden');
    syncRibbonState();
  }
}

function syncRibbonState(): void {
  const showingFiles = shellElement.classList.contains('showing-files');
  const showingGraph = shellElement.classList.contains('showing-graph');
  filesViewElement.classList.toggle(
    'active',
    mobileMedia.matches
      ? showingFiles
      : !shellElement.classList.contains('sidebar-hidden')
  );
  noteViewElement.classList.toggle(
    'active',
    singlePaneMedia.matches ? !showingFiles && !showingGraph : true
  );
  graphViewElement.classList.toggle(
    'active',
    singlePaneMedia.matches
      ? !showingFiles && showingGraph
      : !shellElement.classList.contains('graph-hidden')
  );
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
    const file = resolveWikiTarget(payload?.files ?? [], target);
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

graphLocalToggleElement.addEventListener('click', () =>
  setGraphMode(graphMode === 'local' ? 'global' : 'local')
);
graphSettingsToggleElement.addEventListener('click', () =>
  setGraphSettingsOpen(graphSettingsElement.hidden)
);
query<HTMLButtonElement>('#graph-settings-close').addEventListener(
  'click',
  () => setGraphSettingsOpen(false)
);
for (const control of [
  graphFilterElement,
  graphShowOrphansElement,
  graphShowUnresolvedElement,
  graphTextFadeElement,
  graphNodeSizeElement,
  graphLinkWidthElement,
  graphRepelElement,
  graphLinkDistanceElement,
  graphDepthElement,
]) {
  control.addEventListener('input', readGraphSettingsControls);
}
query<HTMLButtonElement>('#graph-reset').addEventListener('click', () => {
  graphPreferences = { ...DEFAULT_GRAPH_PREFERENCES };
  applyGraphFilters();
  applyGraphPreferences();
});

vaultSwitcherElement.addEventListener('click', toggleVaultMenu);
filesViewElement.addEventListener('click', showFilesView);
noteViewElement.addEventListener('click', () => showWorkspacePane('reader'));
graphViewElement.addEventListener('click', showGraphView);
singlePaneMedia.addEventListener('change', syncRibbonState);
mobileMedia.addEventListener('change', () => {
  shellElement.classList.remove('showing-files');
  syncRibbonState();
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

applyTheme(undefined);
syncRibbonState();
void app.connect().then(() => {
  applyTheme(app.getHostContext()?.theme);
  void requestFullscreen();
});
