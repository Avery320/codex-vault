import { withMcpServer } from './test-setup';

describe('VaultChangeFeed', () => {
  it('returns immediately when the caller has an older revision', () =>
    withMcpServer({ 'a.md': '# A' }, async ctx => {
      const uri = ctx.rootUri.joinPath('a.md');
      ctx.dataStore.set(uri, '# Updated A');
      await ctx.foam.workspace.fetchAndSet(uri);

      await expect(ctx.changeFeed.waitForChange(0, 1_000)).resolves.toEqual({
        revision: 1,
        reset: false,
      });
    }));

  it('removes a pending wait when its request is aborted', () =>
    withMcpServer({ 'a.md': '# A' }, async ctx => {
      const controller = new AbortController();
      const wait = ctx.changeFeed.waitForChange(
        ctx.changeFeed.revision,
        1_000,
        controller.signal
      );

      controller.abort();

      await expect(wait).rejects.toMatchObject({ name: 'AbortError' });
    }));
});
