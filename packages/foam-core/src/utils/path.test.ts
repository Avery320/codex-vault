import { URI } from '../model/uri';
import {
  changeExtension,
  fromFsPath,
  getBasename,
  getDirectory,
  getExtension,
  getName,
  isAbsolute,
  isWithinPath,
  joinPath,
  relativeTo,
  toFsPath,
} from './path';

describe('path utils', () => {
  it('normalizes filesystem separators', () => {
    for (const [input, expected] of [
      ['areas\\dailies\\2024\\file.md', 'areas/dailies/2024/file.md'],
      ['areas/dailies\\2024/file.md', 'areas/dailies/2024/file.md'],
      ['C:\\workspace\\file.md', '/C:/workspace/file.md'],
    ]) {
      expect(fromFsPath(input)[0]).toBe(expected);
    }
  });

  it('extracts Markdown path components', () => {
    expect(getDirectory('/vault/notes/topic.md')).toBe('/vault/notes');
    expect(getBasename('/vault/notes/topic.md')).toBe('topic.md');
    expect(getExtension('/vault/notes/topic.md')).toBe('.md');
    expect(getName('/vault/notes/topic.md')).toBe('topic');
    expect(getName('/vault/.hidden')).toBe('.hidden');
  });

  it('joins and normalizes note paths', () => {
    expect(joinPath('/vault/notes', '..', 'daily', 'today.md')).toBe(
      '/vault/daily/today.md'
    );
  });

  it('computes workspace-relative paths', () => {
    expect(relativeTo('/vault/daily/today.md', '/vault/notes')).toBe(
      '../daily/today.md'
    );
  });

  it('changes matching note extensions', () => {
    expect(changeExtension('/note.md', '.md', '.txt')).toBe('/note.txt');
    expect(changeExtension('/note.md', '.txt', '.html')).toBe('/note.md');
    expect(changeExtension('/note.md', '*', '')).toBe('/note');
  });

  it('recognizes absolute paths', () => {
    expect(isAbsolute('/vault/note.md')).toBe(true);
    expect(isAbsolute('notes/note.md')).toBe(false);
  });

  it('enforces Vault containment at path boundaries', () => {
    const root = URI.file('/vault');
    expect(isWithinPath(URI.file('/vault'), root)).toBe(true);
    expect(isWithinPath(URI.file('/vault/notes/note.md'), root)).toBe(true);
    expect(isWithinPath(URI.file('/vault-other/note.md'), root)).toBe(false);
  });

  it('round-trips a Windows filesystem path', () => {
    const fsPath = 'C:\\workspace\\file.md';
    expect(toFsPath(fromFsPath(fsPath)[0])).toBe(fsPath);
  });
});
