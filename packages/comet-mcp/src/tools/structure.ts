import { z } from 'zod';
import { outlineData, resolveNote } from '@comet/core';
import { parseUriInput, serializeOutlineResult } from '../serializers';
import type { ToolRegistrar } from '../server';
import { json } from '../tool-result';
import {
  CometMcpWorkspaceProvider,
  requireWorkspace,
} from '../workspace-context';

export function registerStructureTools(
  register: ToolRegistrar,
  workspaceProvider: CometMcpWorkspaceProvider
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
      const { comet, rootUri } = requireWorkspace(workspaceProvider);
      const uri = parseUriInput(args.uri, rootUri);
      const resource = resolveNote(comet.workspace, { uri });
      const outline = outlineData(comet.workspace, resource);
      return json(serializeOutlineResult(outline, rootUri));
    }
  );
}
