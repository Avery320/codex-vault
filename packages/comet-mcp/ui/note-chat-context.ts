import type { NoteSelection } from './note-selection';

export interface NoteAnnotation extends NoteSelection {
  comment?: string;
}

export interface ModelContextPayload {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
}

export function createSelectionModelContext(
  annotations: readonly NoteAnnotation[]
): ModelContextPayload {
  return {
    content: [{ type: 'text', text: formatAnnotationText(annotations) }],
    structuredContent: {
      annotations: annotations.map(serializeAnnotation),
    },
  };
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
