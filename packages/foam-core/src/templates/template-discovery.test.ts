import {
  getNewNoteTemplateCandidateUris,
  getTemplatesDir,
} from './template-discovery';
import { URI } from '../model/uri';

describe('getTemplatesDir', () => {
  it('returns .foam/templates under the workspace root', () => {
    const templates = getTemplatesDir(URI.file('/workspace'));
    expect(templates.path).toBe('/workspace/.foam/templates');
  });
});

describe('getNewNoteTemplateCandidateUris', () => {
  it('returns new-note.js and new-note.md under the templates dir', () => {
    const dir = URI.file('/workspace/.foam/templates');
    const candidates = getNewNoteTemplateCandidateUris(dir);
    expect(candidates.map(candidate => candidate.path)).toEqual([
      '/workspace/.foam/templates/new-note.js',
      '/workspace/.foam/templates/new-note.md',
    ]);
  });
});
