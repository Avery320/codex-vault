import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function pickVaultFolder(): Promise<string | null> {
  if (process.platform !== 'darwin') {
    throw new Error('Native folder selection is not available on this platform.');
  }

  try {
    const { stdout } = await execFileAsync('/usr/bin/osascript', [
      '-e',
      'POSIX path of (choose folder with prompt "選擇 Vault 資料夾")',
    ]);
    return stdout.trim().replace(/\/$/, '') || null;
  } catch (error) {
    if ((error as { stderr?: string }).stderr?.includes('(-128)')) return null;
    throw error;
  }
}
