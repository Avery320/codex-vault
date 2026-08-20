import { App } from '@modelcontextprotocol/ext-apps';
import '@foam/graph-view';
import {
  createTree,
  filterGraphData,
  resolveWikiTarget,
  type GraphData,
  type TreeNode,
  type VaultFile,
} from './vault-explorer-model';
import {
  createNoteSelection,
  sourceLineRange,
  type NoteSelection,
} from './note-selection';
import {
  annotationsFromModelContextHostState,
  createSelectionModelContext,
  MODEL_CONTEXT_HOST_STATE_KEY,
  type NoteAnnotation,
} from './note-chat-context';
import { createVaultMarkdownRenderer } from './vault-markdown';

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
  clearSelection(): void;
}

interface ToolResultLike {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
}

interface GraphPreferences {
  filterQuery: string;
  showTags: boolean;
  showAttachments: boolean;
  showOrphans: boolean;
  existingFilesOnly: boolean;
  textFade: number;
  nodeSize: number;
  linkWidth: number;
  repel: number;
  linkDistance: number;
  localDepth: number;
}

type VaultDialogMode = 'register' | 'create';
type GraphMode = 'global' | 'local';
type LayoutMode = 'desktop' | 'compact' | 'mobile';
type WorkspacePane = 'files' | 'reader' | 'graph';

const workspaceLayout = {
  sidebarOpen: true,
  graphOpen: true,
  activePane: 'reader' as WorkspacePane,
  sidebarWidth: 300,
  readerWidth: 520,
};

const app = new App(
  { name: 'Codex Vault Explorer', version: '0.1.0' },
  {},
  { autoResize: false }
);
const markdown = createVaultMarkdownRenderer();

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

const shellElement = query<HTMLElement>('#shell');
const sidebarResizerElement = query<HTMLElement>('#sidebar-resizer');
const workspaceResizerElement = query<HTMLElement>('#workspace-resizer');
const graphElement = query<FoamGraphElement>('#graph');
const treeElement = query<HTMLDivElement>('#tree');
const markdownElement = query<HTMLDivElement>('#markdown');
const readerScrollElement = query<HTMLDivElement>('.reader-scroll');
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
const graphSettingsElement = query<HTMLFormElement>('#graph-settings');
const graphSettingsToggleElement = query<HTMLButtonElement>(
  '#graph-settings-toggle'
);
const graphLocalToggleElement = query<HTMLButtonElement>('#graph-local-toggle');
const graphFilterElement = query<HTMLInputElement>('#graph-filter');
const graphShowTagsElement = query<HTMLInputElement>('#graph-show-tags');
const graphShowAttachmentsElement = query<HTMLInputElement>(
  '#graph-show-attachments'
);
const graphShowOrphansElement = query<HTMLInputElement>('#graph-show-orphans');
const graphExistingFilesOnlyElement = query<HTMLInputElement>(
  '#graph-existing-files-only'
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
const selectionMenuElement = query<HTMLElement>('#selection-menu');
const addSelectionElement = query<HTMLButtonElement>('#add-selection');
const annotationFormElement = query<HTMLFormElement>('#annotation-form');
const annotationCommentElement = query<HTMLTextAreaElement>(
  '#annotation-comment'
);
const annotationCancelElement = query<HTMLButtonElement>('#annotation-cancel');
const annotationSubmitElement = query<HTMLButtonElement>('#annotation-submit');

let payload: ExplorerPayload | null = null;
let activeUri: string | null = null;
let activeNoteSource = '';
let pendingSelection: NoteSelection | null = null;
let pendingSelectionRect: DOMRect | null = null;
let attachedAnnotations: NoteAnnotation[] = [];
let annotationSubmitInFlight = false;
let searchTimer: number | undefined;
let searchSequence = 0;
let noteSequence = 0;
let addSelectionPointerArmed = false;
let selectionMenuAcceptPointerAfter = 0;
let dialogMode: VaultDialogMode = 'register';
let graphMode: GraphMode = 'global';
let graphPreferences: GraphPreferences;
let displayedSidebarWidth = workspaceLayout.sidebarWidth;
let displayedReaderWidth = workspaceLayout.readerWidth;

graphElement.showControls = false;
graphElement.maxFitZoom = 2.2;
graphElement.selection = {
  neighborDepth: 1,
  centerOnSelect: false,
  zoomOnSelect: false,
};

function applyTheme(theme: string | undefined): void {
  const resolved = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = resolved;
  applyGraphPreferences();
}

function applyGraphFilters(): void {
  graphElement.graphData = payload
    ? filterGraphData(payload.graph, {
        query: graphPreferences.filterQuery,
        showOrphans: graphPreferences.showOrphans,
        showUnresolved: !graphPreferences.existingFilesOnly,
      })
    : null;
}

function applyGraphPreferences(): void {
  const theme = getComputedStyle(document.documentElement);
  const color = (name: string): string => theme.getPropertyValue(name).trim();
  graphElement.graphStyle = {
    colorMode: 'type',
    showNodesOfType: {
      note: true,
      tag: graphPreferences.showTags,
      placeholder: !graphPreferences.existingFilesOnly,
      image: graphPreferences.showAttachments,
      attachment: graphPreferences.showAttachments,
    },
    style: {
      background: 'transparent',
      fontFamily: color('--font-interface'),
      lineColor: color('--background-modifier-border-hover'),
      highlightedForeground: color('--text-normal'),
      node: {
        note: color('--text-muted'),
        image: color('--text-muted'),
        attachment: color('--text-muted'),
        placeholder: color('--text-faint'),
        tag: color('--color-green'),
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

function updateGraphOutputs(): void {
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

function readGraphPreferences(): GraphPreferences {
  return {
    filterQuery: graphFilterElement.value,
    showTags: graphShowTagsElement.checked,
    showAttachments: graphShowAttachmentsElement.checked,
    showOrphans: graphShowOrphansElement.checked,
    existingFilesOnly: graphExistingFilesOnlyElement.checked,
    textFade: Number(graphTextFadeElement.value),
    nodeSize: Number(graphNodeSizeElement.value),
    linkWidth: Number(graphLinkWidthElement.value),
    repel: Number(graphRepelElement.value),
    linkDistance: Number(graphLinkDistanceElement.value),
    localDepth: Number(graphDepthElement.value),
  };
}

function updateGraphPreferences(): void {
  const previous = graphPreferences;
  graphPreferences = readGraphPreferences();
  if (
    previous.filterQuery !== graphPreferences.filterQuery ||
    previous.showOrphans !== graphPreferences.showOrphans ||
    previous.existingFilesOnly !== graphPreferences.existingFilesOnly
  ) {
    applyGraphFilters();
  }
  applyGraphPreferences();
  updateGraphOutputs();
}

function setGraphSettingsOpen(open: boolean): void {
  graphSettingsElement.hidden = !open;
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
    activeNoteSource = '';
    dismissSelectionCandidate(true);
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
    activeNoteSource = '';
    dismissSelectionCandidate(true);
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

function selectActiveFile(uri: string): void {
  for (const file of treeElement.querySelectorAll<HTMLButtonElement>('.file')) {
    file.classList.toggle('active', file.dataset.uri === uri);
  }
}

async function openNote(uri: string): Promise<void> {
  if (!payload) return;
  showWorkspacePane('reader');
  const sequence = ++noteSequence;
  activeUri = uri;
  activeNoteSource = '';
  dismissSelectionCandidate(true);
  const file = payload.files.find(item => item.uri === uri);
  noteTitleElement.textContent = file?.title ?? uri;
  notePathElement.textContent = uri;
  notePathElement.title = uri;
  selectActiveFile(uri);
  applyGraphScope();
  graphElement.clearSelection();
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
    activeNoteSource = resource.content;
    renderMarkdown(resource.content);
    renderBacklinks(connections.backlinks);
  } catch (error) {
    if (sequence !== noteSequence) return;
    activeNoteSource = '';
    dismissSelectionCandidate(true);
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
  markdownElement.innerHTML = markdown.render(source);
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

function captureNoteSelection(): void {
  const browserSelection = window.getSelection();
  if (
    !activeUri ||
    !activeNoteSource ||
    !browserSelection ||
    browserSelection.rangeCount !== 1 ||
    browserSelection.isCollapsed
  ) {
    dismissSelectionCandidate();
    return;
  }

  const sourceRange = sourceLineRange(browserSelection, markdownElement);
  if (!sourceRange) {
    dismissSelectionCandidate();
    return;
  }

  const selection = createNoteSelection({
    vaultId: payload?.active_vault?.id,
    vaultName: payload?.active_vault?.name ?? 'Vault',
    noteUri: activeUri,
    source: activeNoteSource,
    quote: browserSelection.toString(),
    startLine: sourceRange.startLine,
    endLine: sourceRange.endLine,
  });
  if (!selection) {
    dismissSelectionCandidate();
    return;
  }

  pendingSelection = selection;
  showSelectionMenu(browserSelection.getRangeAt(0));
}

function showSelectionMenu(range: Range): void {
  selectionMenuElement.hidden = false;
  resetAnnotationEditor();
  selectionMenuAcceptPointerAfter = performance.now() + 250;
  const rect = range.getBoundingClientRect();
  pendingSelectionRect = rect;
  positionSelectionMenu(rect);
}

function positionSelectionMenu(rect: DOMRect): void {
  const menuWidth = selectionMenuElement.offsetWidth;
  const menuHeight = selectionMenuElement.offsetHeight;
  const margin = 8;
  const left = clamp(
    rect.left + rect.width / 2 - menuWidth / 2,
    margin,
    Math.max(margin, window.innerWidth - menuWidth - margin)
  );
  const below = rect.bottom + margin;
  const top =
    below + menuHeight <= window.innerHeight - margin
      ? below
      : Math.max(margin, rect.top - menuHeight - margin);
  selectionMenuElement.style.left = `${left}px`;
  selectionMenuElement.style.top = `${top}px`;
}

function showAnnotationEditor(): void {
  if (!pendingSelection || !pendingSelectionRect) return;
  addSelectionElement.hidden = true;
  annotationFormElement.hidden = false;
  selectionMenuElement.classList.add('editing');
  positionSelectionMenu(pendingSelectionRect);
  annotationCommentElement.focus();
}

function resetAnnotationEditor(): void {
  annotationFormElement.reset();
  annotationFormElement.hidden = true;
  addSelectionElement.hidden = false;
  annotationSubmitElement.disabled = false;
  annotationSubmitInFlight = false;
  selectionMenuElement.classList.remove('editing');
}

function dismissSelectionCandidate(clearBrowserSelection = false): void {
  pendingSelection = null;
  pendingSelectionRect = null;
  selectionMenuElement.hidden = true;
  resetAnnotationEditor();
  if (clearBrowserSelection) window.getSelection()?.removeAllRanges();
}

async function attachSelectionToChat(): Promise<void> {
  const selection = pendingSelection;
  if (!selection || annotationSubmitInFlight) return;
  const comment = annotationCommentElement.value.replace(/\r\n?/g, '\n').trim();
  const annotation: NoteAnnotation = {
    ...selection,
    comment: comment || undefined,
  };
  const nextAnnotations = [...attachedAnnotations, annotation];
  annotationSubmitInFlight = true;
  annotationSubmitElement.disabled = true;

  if (await updateSelectionModelContext(nextAnnotations)) {
    attachedAnnotations = nextAnnotations;
    dismissSelectionCandidate(true);
    setStatus(`已加入 Codex 聊天輸入框（${nextAnnotations.length} 則註解）`);
    return;
  }

  annotationSubmitInFlight = false;
  annotationSubmitElement.disabled = false;
  setStatus('無法加入聊天上下文，請再試一次。', true);
}

async function updateSelectionModelContext(
  annotations: readonly NoteAnnotation[]
): Promise<boolean> {
  try {
    await app.updateModelContext(createSelectionModelContext(annotations));
    return true;
  } catch {
    return false;
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

function layoutMode(): LayoutMode {
  const width = shellElement.clientWidth || window.innerWidth;
  return width <= 680 ? 'mobile' : width <= 1000 ? 'compact' : 'desktop';
}

function showWorkspacePane(pane: WorkspacePane): void {
  const mode = layoutMode();
  if (mode === 'mobile') workspaceLayout.activePane = pane;
  else if (pane === 'files')
    workspaceLayout.sidebarOpen = !workspaceLayout.sidebarOpen;
  else if (mode === 'compact') workspaceLayout.activePane = pane;
  else if (pane === 'graph')
    workspaceLayout.graphOpen = !workspaceLayout.graphOpen;
  else workspaceLayout.activePane = 'reader';

  if (pane === 'graph' && mode !== 'desktop') workspaceLayout.graphOpen = true;
  if (pane === 'files' && mode === 'mobile') workspaceLayout.sidebarOpen = true;
  applyWorkspaceLayout();
}

function applyWorkspaceLayout(): void {
  const viewportWidth = shellElement.clientWidth || window.innerWidth;
  const mode = layoutMode();
  const desktop = mode === 'desktop';
  const mobile = mode === 'mobile';
  const showSidebar = mobile
    ? workspaceLayout.activePane === 'files'
    : workspaceLayout.sidebarOpen;
  const showReader = desktop || workspaceLayout.activePane !== 'graph';
  const showGraph = desktop
    ? workspaceLayout.graphOpen
    : workspaceLayout.activePane === 'graph';
  const ribbonWidth = mode === 'desktop' ? 48 : mode === 'compact' ? 46 : 42;
  const sidebarMaximum = Math.max(
    220,
    Math.min(480, viewportWidth - ribbonWidth - 5 - (desktop ? 605 : 320))
  );
  displayedSidebarWidth = clamp(
    workspaceLayout.sidebarWidth,
    220,
    sidebarMaximum
  );
  const workspaceWidth =
    viewportWidth -
    ribbonWidth -
    (showSidebar && !mobile ? displayedSidebarWidth + 5 : 0);
  displayedReaderWidth = clamp(
    workspaceLayout.readerWidth,
    320,
    Math.max(320, workspaceWidth - 285)
  );

  shellElement.style.setProperty(
    '--sidebar-width',
    `${displayedSidebarWidth}px`
  );
  shellElement.style.setProperty('--reader-width', `${displayedReaderWidth}px`);
  shellElement.dataset.layout = mode;
  shellElement.classList.toggle('sidebar-hidden', !showSidebar);
  shellElement.classList.toggle('showing-files', mobile && showSidebar);
  shellElement.classList.toggle('showing-graph', showGraph && !showReader);
  shellElement.classList.toggle('graph-hidden', !showGraph);

  sidebarResizerElement.hidden = mobile || !showSidebar;
  workspaceResizerElement.hidden = !desktop || !showGraph;
  for (const [button, visible] of [
    [filesViewElement, showSidebar],
    [noteViewElement, showReader],
    [graphViewElement, showGraph],
  ] as Array<[HTMLButtonElement, boolean]>) {
    button.classList.toggle('active', visible);
    button.setAttribute('aria-pressed', String(visible));
  }
}

function startPaneResize(
  kind: 'sidebar' | 'workspace',
  event: PointerEvent
): void {
  if (event.button !== 0) return;
  const resizer =
    kind === 'sidebar' ? sidebarResizerElement : workspaceResizerElement;
  const property = kind === 'sidebar' ? 'sidebarWidth' : 'readerWidth';
  const startX = event.clientX;
  const startWidth =
    kind === 'sidebar' ? displayedSidebarWidth : displayedReaderWidth;
  event.preventDefault();
  resizer.classList.add('active');
  document.body.classList.add('resizing-panes');

  const move = (moveEvent: PointerEvent): void => {
    workspaceLayout[property] = startWidth + moveEvent.clientX - startX;
    applyWorkspaceLayout();
  };
  const finish = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    resizer.classList.remove('active');
    document.body.classList.remove('resizing-panes');
    workspaceLayout[property] =
      kind === 'sidebar' ? displayedSidebarWidth : displayedReaderWidth;
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
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
markdownElement.addEventListener('pointerdown', () =>
  dismissSelectionCandidate()
);
markdownElement.addEventListener('pointerup', captureNoteSelection);
markdownElement.addEventListener('keyup', captureNoteSelection);
readerScrollElement.addEventListener('scroll', () =>
  dismissSelectionCandidate()
);
selectionMenuElement.addEventListener('pointerdown', event => {
  event.stopPropagation();
});
addSelectionElement.addEventListener('pointerdown', () => {
  addSelectionPointerArmed = true;
});
addSelectionElement.addEventListener('pointercancel', () => {
  addSelectionPointerArmed = false;
});
addSelectionElement.addEventListener('click', event => {
  const keyboardActivation = event.detail === 0;
  const pointerActivationReady =
    addSelectionPointerArmed &&
    performance.now() >= selectionMenuAcceptPointerAfter;
  addSelectionPointerArmed = false;
  if (!keyboardActivation && !pointerActivationReady) return;
  showAnnotationEditor();
});
annotationCancelElement.addEventListener('click', () =>
  dismissSelectionCandidate(true)
);
annotationFormElement.addEventListener('submit', event => {
  event.preventDefault();
  void attachSelectionToChat();
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
graphSettingsElement.addEventListener('input', updateGraphPreferences);
graphSettingsElement.addEventListener('submit', event =>
  event.preventDefault()
);
query<HTMLButtonElement>('#graph-reset').addEventListener('click', () => {
  graphSettingsElement.reset();
  updateGraphPreferences();
});

vaultSwitcherElement.addEventListener('click', toggleVaultMenu);
filesViewElement.addEventListener('click', () => showWorkspacePane('files'));
noteViewElement.addEventListener('click', () => showWorkspacePane('reader'));
graphViewElement.addEventListener('click', () => showWorkspacePane('graph'));
sidebarResizerElement.addEventListener('pointerdown', event =>
  startPaneResize('sidebar', event)
);
workspaceResizerElement.addEventListener('pointerdown', event =>
  startPaneResize('workspace', event)
);
window.addEventListener('resize', applyWorkspaceLayout);
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
    !selectionMenuElement.contains(target) &&
    !markdownElement.contains(target)
  ) {
    dismissSelectionCandidate();
  }
  if (
    !vaultMenuElement.contains(target) &&
    !vaultSwitcherElement.contains(target)
  ) {
    closeVaultMenu();
  }
});

app.ontoolresult = receiveToolResult;
app.onhostcontextchanged = context => {
  if (context.theme !== undefined) applyTheme(context.theme);
  if (MODEL_CONTEXT_HOST_STATE_KEY in context) {
    attachedAnnotations = annotationsFromModelContextHostState(context);
  }
};

graphPreferences = readGraphPreferences();
updateGraphOutputs();
applyTheme(undefined);
applyWorkspaceLayout();
void app.connect().then(() => {
  const hostContext = app.getHostContext();
  applyTheme(hostContext?.theme);
  attachedAnnotations = annotationsFromModelContextHostState(hostContext);
  void requestFullscreen();
});
