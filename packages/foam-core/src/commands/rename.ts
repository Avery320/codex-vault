import { TextEdit, WorkspaceTextEdit } from '../services/text-edit';
import { TagEdit } from '../services/tag-edit';
import { FoamTags } from '../model/tags';
import { IDataStore } from '../services/datastore';
import { FoamError } from '../common/errors';

export interface RenameTagResult {
  old_tag: string;
  new_tag: string;
  updated_notes: number;
}

async function applyEditsToFiles(
  edits: WorkspaceTextEdit[],
  dataStore: IDataStore
): Promise<void> {
  for (const { uri, edits: fileEdits } of WorkspaceTextEdit.groupByUri(edits)) {
    const content = await dataStore.read(uri);
    if (content === null) {
      throw new FoamError(
        'io_error',
        `Cannot apply edits: failed to read ${uri.toFsPath()}`,
        { uri: uri.toFsPath() }
      );
    }
    await dataStore.write(uri, TextEdit.apply(content, fileEdits));
  }
}

export async function renameTag(
  tags: FoamTags,
  dataStore: IDataStore,
  oldTag: string,
  newTag: string,
  force: boolean
): Promise<RenameTagResult> {
  const cleanOld = oldTag.startsWith('#') ? oldTag.slice(1) : oldTag;
  const cleanNew = newTag.startsWith('#') ? newTag.slice(1) : newTag;
  const validation = TagEdit.validateTagRename(tags, cleanOld, cleanNew);

  if (!validation.isValid || (validation.isMerge && !force)) {
    throw new FoamError(
      'invalid_input',
      validation.message ?? 'Invalid tag rename.',
      validation.isMerge ? { isMerge: true } : undefined
    );
  }

  const result = TagEdit.createHierarchicalRenameEdits(
    tags,
    cleanOld,
    cleanNew
  );
  await applyEditsToFiles(result.edits, dataStore);

  return {
    old_tag: cleanOld,
    new_tag: cleanNew,
    updated_notes: new Set(result.edits.map(edit => edit.uri.toFsPath())).size,
  };
}
