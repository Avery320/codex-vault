import { CometWorkspace } from './workspace';
import { IDisposable } from '../common/lifecycle';
import { Tag } from './note';
import { locationForObjectWithRange, type Location } from './location';

export class CometTags implements IDisposable {
  public readonly tags: Map<string, Location<Tag>[]> = new Map();

  /**
   * List of disposables to destroy with the tags
   */
  private disposables: IDisposable[] = [];

  constructor(private readonly workspace: CometWorkspace) {}

  /**
   * Computes all tags in the workspace and keep them up-to-date
   *
   * @param workspace the target workspace
   * @returns the CometTags
   */
  public static fromWorkspace(workspace: CometWorkspace): CometTags {
    const tags = new CometTags(workspace);
    tags.update();
    const updateTags = tags.update.bind(tags);
    tags.disposables.push(
      workspace.onDidAdd(updateTags),
      workspace.onDidUpdate(updateTags),
      workspace.onDidDelete(updateTags)
    );
    return tags;
  }

  private update(): void {
    this.tags.clear();
    for (const resource of this.workspace.resources()) {
      for (const tag of resource.tags) {
        const tagLocations = this.tags.get(tag.label) ?? [];
        tagLocations.push(locationForObjectWithRange(resource.uri, tag));
        this.tags.set(tag.label, tagLocations);
      }
    }
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
