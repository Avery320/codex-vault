import type { NoteSelection } from './note-selection';

export const MODEL_CONTEXT_HOST_STATE_KEY = 'openai/modelContext';

export interface NoteAnnotation extends NoteSelection {
  comment?: string;
}

export interface ModelContextPayload {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  presentation: {
    composerAttachmentLayout: 'pill';
    composerLabel: string;
  };
}

export function createSelectionModelContext(
  annotations: readonly NoteAnnotation[]
): ModelContextPayload {
  return {
    content: [{ type: 'text', text: formatAnnotationText(annotations) }],
    structuredContent: {
      annotations: annotations.map(serializeAnnotation),
    },
    presentation: {
      composerAttachmentLayout: 'pill',
      composerLabel: `${annotations.length} 則註解`,
    },
  };
}

export function annotationsFromModelContextHostState(
  hostContext: Record<string, unknown> | undefined
): NoteAnnotation[] {
  const state = hostContext?.[MODEL_CONTEXT_HOST_STATE_KEY];
  if (!isRecord(state)) return [];
  const structuredContent = state.structuredContent;
  if (!isRecord(structuredContent)) return [];
  const annotations = structuredContent.annotations;
  if (!Array.isArray(annotations)) return [];
  return annotations.flatMap(annotation => {
    if (!isRecord(annotation)) return [];
    const {
      vault_id: vaultId,
      vault_name: vaultName,
      note_uri: noteUri,
      quote,
      comment,
      start_line: startLine,
      end_line: endLine,
    } = annotation;
    if (
      typeof vaultName !== 'string' ||
      typeof noteUri !== 'string' ||
      typeof quote !== 'string' ||
      typeof startLine !== 'number' ||
      typeof endLine !== 'number'
    ) {
      return [];
    }
    return [
      {
        vaultId: typeof vaultId === 'string' ? vaultId : undefined,
        vaultName,
        noteUri,
        quote,
        comment: typeof comment === 'string' ? comment : undefined,
        startLine,
        endLine,
      },
    ];
  });
}

function formatAnnotationText(annotations: readonly NoteAnnotation[]): string {
  return annotations
    .map((annotation, index) => {
      const parts = [`${index + 1}。 選取的文字：`, annotation.quote];
      if (annotation.comment) {
        parts.push('', '使用者留言：', annotation.comment);
      }
      return parts.join('\n');
    })
    .join('\n\n');
}

function serializeAnnotation(
  annotation: NoteAnnotation
): Record<string, unknown> {
  return {
    vault_id: annotation.vaultId,
    vault_name: annotation.vaultName,
    note_uri: annotation.noteUri,
    quote: annotation.quote,
    comment: annotation.comment,
    start_line: annotation.startLine,
    end_line: annotation.endLine,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
