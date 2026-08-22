import { Resource, ResourceLink } from './note';
import { URI } from './uri';
import { CometWorkspace } from './workspace';

export interface ResourceProvider {
  supports: (uri: URI) => boolean;
  fetch: (uri: URI) => Promise<Resource | null>;
  resolveLink: (
    workspace: CometWorkspace,
    resource: Resource,
    link: ResourceLink
  ) => URI;
}
