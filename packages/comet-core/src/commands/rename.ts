import type { Comet } from '../model/comet';
import type { Location } from '../model/location';
import type { Tag } from '../model/note';
import type { WorkspaceTextEdit } from '../services/text-edit';
import { applyWorkspaceTextEdits } from '../services/workspace-mutation';
import { CometError } from '../common/errors';
import { WORD_REGEX } from '../utils/hashtags';

export interface RenameTagResult {
  old_tag: string;
  new_tag: string;
  updated_notes: number;
}

function replacementFor(
  location: Location<Tag>,
  oldLabel: string,
  newLabel: string
) {
  const rangeLength =
    location.range.end.character - location.range.start.character;
  return rangeLength === oldLabel.length + 1 ? `#${newLabel}` : newLabel;
}

export async function renameTag(
  comet: Comet,
  oldTag: string,
  newTag: string,
  force: boolean
): Promise<RenameTagResult> {
  const cleanOld = oldTag.startsWith('#') ? oldTag.slice(1) : oldTag;
  const cleanNew = newTag.startsWith('#') ? newTag.slice(1) : newTag;
  const tags = comet.tags.tags;

  if (!tags.has(cleanOld)) {
    throw new CometError(
      'invalid_input',
      `Tag "${cleanOld}" does not exist in the workspace.`
    );
  }
  if (!cleanNew) {
    throw new CometError('invalid_input', 'New tag label cannot be empty.');
  }
  if (cleanNew.match(WORD_REGEX)?.[0] !== cleanNew) {
    throw new CometError('invalid_input', 'Invalid tag label.');
  }
  if (cleanOld === cleanNew) {
    throw new CometError(
      'invalid_input',
      'New tag name is the same as the current name.'
    );
  }
  if (tags.has(cleanNew) && !force) {
    throw new CometError(
      'invalid_input',
      `Tag "${cleanNew}" already exists. Pass force to merge tags.`,
      { isMerge: true }
    );
  }

  const edits: WorkspaceTextEdit[] = [];
  for (const [label, locations] of tags) {
    if (label !== cleanOld && !label.startsWith(`${cleanOld}/`)) continue;
    const replacement = cleanNew + label.slice(cleanOld.length);
    for (const location of locations) {
      edits.push({
        uri: location.uri,
        edit: {
          range: location.range,
          newText: replacementFor(location, label, replacement),
        },
      });
    }
  }
  await applyWorkspaceTextEdits(comet, edits);

  return {
    old_tag: cleanOld,
    new_tag: cleanNew,
    updated_notes: new Set(edits.map(edit => edit.uri.toFsPath())).size,
  };
}
