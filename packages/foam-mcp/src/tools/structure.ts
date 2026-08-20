import { z } from 'zod';
import { outlineData, resolveNote } from '@foam/core';
import { parseUriInput, serializeOutlineResult } from '../serializers';
import type { ToolRegistrar } from '../server';
import { json } from '../tool-result';
import {
  FoamMcpWorkspaceProvider,
  requireWorkspace,
} from '../workspace-context';

export function registerStructureTools(
  register: ToolRegistrar,
  workspaceProvider: FoamMcpWorkspaceProvider
) {
  register(
    'get_outline',
    {
      description: 'Return the heading structure (sections) of a resource.',
      inputSchema: {
        uri: z.string(),
      },
    },
    async args => {
      const { foam, rootUri } = requireWorkspace(workspaceProvider);
      const uri = parseUriInput(args.uri, rootUri);
      const resource = resolveNote(foam.workspace, { uri });
      const outline = outlineData(foam.workspace, resource);
      return json(serializeOutlineResult(outline, rootUri));
    }
  );
}
