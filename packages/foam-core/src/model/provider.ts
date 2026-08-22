import { Resource, ResourceLink } from './note';
import { URI } from './uri';
import { FoamWorkspace } from './workspace';

export interface ResourceProvider {
  supports: (uri: URI) => boolean;
  fetch: (uri: URI) => Promise<Resource | null>;
  resolveLink: (
    workspace: FoamWorkspace,
    resource: Resource,
    link: ResourceLink
  ) => URI;
}
