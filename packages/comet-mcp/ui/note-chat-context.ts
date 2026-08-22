import type { NoteSelection } from './note-selection';

export interface NoteAnnotation extends NoteSelection {
  id: string;
  comment?: string;
}

export interface ModelContextPayload {
  content?: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  presentation?: {
    composerAttachmentLayout: 'pill';
    composerLabel: 'COMET';
  };
}

const CODEX_MODEL_CONTEXT_KEY = 'openai/modelContext';
const ANNOTATION_SEPARATOR = '─'.repeat(28);

export function createSelectionModelContext(
  annotations: readonly NoteAnnotation[]
): ModelContextPayload {
  if (annotations.length === 0) return {};

  return {
    content: [{ type: 'text', text: formatAnnotationText(annotations) }],
    structuredContent: {
      annotations: annotations.map(serializeAnnotation),
    },
    presentation: {
      composerAttachmentLayout: 'pill',
      composerLabel: 'COMET',
    },
  };
}

/** Reads Codex's current next-message attachment from a host context update. */
export function readSelectionModelContext(
  hostContext: Record<string, unknown>
): NoteAnnotation[] | null | undefined {
  if (!(CODEX_MODEL_CONTEXT_KEY in hostContext)) return undefined;
  const state = hostContext[CODEX_MODEL_CONTEXT_KEY];
  if (state === null) return null;
  if (!isRecord(state) || !isRecord(state.structuredContent)) return undefined;

  const values = state.structuredContent.annotations;
  if (!Array.isArray(values)) return undefined;
  const annotations: NoteAnnotation[] = [];
  for (const value of values) {
    const annotation = parseAnnotation(value);
    if (!annotation) return undefined;
    annotations.push(annotation);
  }
  return annotations;
}

function formatAnnotationText(annotations: readonly NoteAnnotation[]): string {
  return annotations
    .map((annotation, index) => {
      const quote = annotation.quote.replace(/\n/g, '\n   ');
      const parts = [`${index + 1}. ${quote}`];
      if (annotation.comment) {
        parts.push(`   ↳ ${annotation.comment.replace(/\n/g, '\n     ')}`);
      }
      return parts.join('\n');
    })
    .join(`\n${ANNOTATION_SEPARATOR}\n`);
}

function serializeAnnotation(
  annotation: NoteAnnotation
): Record<string, unknown> {
  return {
    annotation_id: annotation.id,
    vault_id: annotation.vaultId,
    vault_name: annotation.vaultName,
    note_uri: annotation.noteUri,
    quote: annotation.quote,
    comment: annotation.comment,
    start_line: annotation.startLine,
    end_line: annotation.endLine,
    ui_anchor: {
      content_sha256: annotation.anchor.contentSha256,
      start_path: annotation.anchor.startPath,
      start_offset: annotation.anchor.startOffset,
      end_path: annotation.anchor.endPath,
      end_offset: annotation.anchor.endOffset,
    },
  };
}

function parseAnnotation(value: unknown): NoteAnnotation | null {
  if (!isRecord(value) || !isRecord(value.ui_anchor)) return null;
  const anchor = value.ui_anchor;
  if (
    typeof value.annotation_id !== 'string' ||
    typeof value.vault_name !== 'string' ||
    typeof value.note_uri !== 'string' ||
    typeof value.quote !== 'string' ||
    (value.comment !== undefined && typeof value.comment !== 'string') ||
    (value.vault_id !== undefined && typeof value.vault_id !== 'string') ||
    !isNonNegativeInteger(value.start_line) ||
    !isNonNegativeInteger(value.end_line) ||
    typeof anchor.content_sha256 !== 'string' ||
    !isNumberPath(anchor.start_path) ||
    !isNonNegativeInteger(anchor.start_offset) ||
    !isNumberPath(anchor.end_path) ||
    !isNonNegativeInteger(anchor.end_offset)
  ) {
    return null;
  }

  return {
    id: value.annotation_id,
    vaultId: value.vault_id,
    vaultName: value.vault_name,
    noteUri: value.note_uri,
    quote: value.quote,
    comment: value.comment,
    startLine: value.start_line,
    endLine: value.end_line,
    anchor: {
      contentSha256: anchor.content_sha256,
      startPath: anchor.start_path,
      startOffset: anchor.start_offset,
      endPath: anchor.end_path,
      endOffset: anchor.end_offset,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNumberPath(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isNonNegativeInteger);
}
