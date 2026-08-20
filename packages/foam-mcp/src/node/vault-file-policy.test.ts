import path from 'node:path';
import { URI } from '@foam/core';
import {
  VAULT_EXCLUDED_DIRECTORY_NAMES,
  VaultFilePolicy,
} from './vault-file-policy';

describe('VaultFilePolicy', () => {
  it.each(VAULT_EXCLUDED_DIRECTORY_NAMES)(
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
