// Models
export { URI } from './model/uri';
export { Resource } from './model/note';
export { CometWorkspace } from './model/workspace';
export type { Comet } from './model/comet';
export { bootstrap } from './model/comet';

// Services
export type { IDataStore, IWatcher, IMatcher } from './services/datastore';
export { createMarkdownParser } from './services/markdown-parser';
export { MarkdownResourceProvider } from './services/markdown-provider';
export {
  AttachmentResourceProvider,
  defaultAttachmentExtensions,
} from './services/attachment-provider';

// Graph
export { buildGraphData } from './services/graph-data-builder';

// Logging and lifecycle
export { Logger, BaseLogger } from './utils/log';
export type { ILogger, LogLevel } from './utils/log';
export type { IDisposable } from './common/lifecycle';
export { Emitter } from './common/event';
export type { Event } from './common/event';

// Errors and paths
export { CometError } from './common/errors';
export type { CometErrorCode } from './common/errors';
export { isWithinPath, relativeTo } from './utils/path';

// Workspace operations
export { resolveNote } from './commands/workspace';
export {
  listNotes,
  listTags,
  listOrphans,
  listDeadends,
  listPlaceholders,
} from './commands/list';
export type {
  NoteItem,
  NoteSummary,
  PlaceholderItem,
} from './commands/list';
export { linksData, traverseGraph } from './commands/links';
export type { LinkEntry, TraversalResult } from './commands/links';
export { outlineData } from './commands/outline';
export type { OutlineResult } from './commands/outline';
export { searchByProperty } from './commands/search';
export type { SearchMatch } from './commands/search';
export {
  noteShowData,
  noteCreate,
  noteMove,
  noteDelete,
} from './commands/note';
export type { NoteDetail } from './commands/note';
export { renameTag } from './commands/rename';
export { writeWorkspaceResource } from './services/workspace-mutation';
export {
  mergeFrontmatter,
  addTagsToFrontmatter,
  removeTagsFromFrontmatter,
} from './commands/frontmatter';
