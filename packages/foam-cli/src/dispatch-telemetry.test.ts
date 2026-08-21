import { describe, expect, it } from 'vitest';
import { InMemoryTelemetryReporter } from '@foam/core';
import { runCli } from './index';
import { TestLogger } from './test/test-utils';

describe('dispatch telemetry filtering', () => {
  it('does not emit cli.command-invoked for unknown commands (the command word is unbounded free text)', async () => {
    const reporter = new InMemoryTelemetryReporter();
    const exitCode = await runCli(['not-a-command'], new TestLogger(), reporter);

    // The dispatcher still prints "Unknown command" and exits 1, but no
    // telemetry event fires — typos must not flow into cli.command-invoked.
    expect(exitCode).toBe(1);
    expect(reporter.events.find(e => e.name === 'cli.command-invoked')).toBeUndefined();
  });

  it('does not emit cli.command-invoked when --help appears in the args', async () => {
    const reporter = new InMemoryTelemetryReporter();
    // `mcp --help` is recognized but prints help and returns 0 — the
    // command never runs, so we don't count it as an invocation.
    await runCli(['mcp', '--help'], new TestLogger(), reporter);

    expect(reporter.events.find(e => e.name === 'cli.command-invoked')).toBeUndefined();
  });
});
