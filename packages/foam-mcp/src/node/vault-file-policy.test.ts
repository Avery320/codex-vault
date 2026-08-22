import path from 'node:path';
import { URI } from '@foam/core';
import { VaultFilePolicy } from './vault-file-policy';

describe('VaultFilePolicy', () => {
  it.each(['.astro', '.git', '.obsidian', '.trash', '.yarn', 'node_modules'])(
    'ignores every file below %s',
    directoryName => {
      const policy = new VaultFilePolicy();
      const uri = URI.file(
        path.join('/vault', directoryName, 'nested', 'note.md')
      );

      expect(policy.isMatch(uri)).toBe(false);
    }
  );

  it('does not exclude unrelated dot directories', () => {
    const policy = new VaultFilePolicy();

    expect(policy.isMatch(URI.file('/vault/.foam/templates/note.md'))).toBe(
      true
    );
  });
});
