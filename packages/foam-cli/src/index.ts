import {
  type ILogger,
  type ITelemetryReporter,
  Logger,
  LogLevel,
  BaseLogger,
  NoopTelemetryReporter,
  TELEMETRY_CONNECTION_STRING,
} from '@foam/core';
import { parseMcpArgs, MCP_HELP, runMcpCommand } from './commands/mcp';
import { AppInsightsReporter, httpsPoster } from './support/telemetry-reporter';
import { resolveCliReporter } from './support/resolve-reporter';
import {
  CommandRunResult,
  shouldSkipTelemetry,
  withTelemetry,
} from './support/with-telemetry';

declare const __CLI_VERSION__: string;
declare const __CORE_VERSION__: string;

const CLI_HELP = `Usage: foam mcp [options]

Codex Vault uses this package only as its Node.js stdio MCP runtime.

Commands:
  mcp         Run the Codex Vault MCP server

Options:
  --help      Show help
  --version   Show the runtime version
`;

export type { ILogger as CliLogger } from '@foam/core';

export function renderCliHelp(): string {
  return CLI_HELP;
}

class ConsoleLogger extends BaseLogger {
  log(level: LogLevel, msg?: string, ...params: any[]): void {
    const formattedMsg = level === 'info' ? msg : `[${level}] ${msg}`;
    console[level](formattedMsg, ...params);
  }
}

export async function runCli(
  argv: string[],
  logger: ILogger = new ConsoleLogger(),
  reporter: ITelemetryReporter = NoopTelemetryReporter
): Promise<number> {
  const [command, ...commandArgs] = argv;
  if (shouldSkipTelemetry(command, commandArgs)) {
    return toExitCode(await dispatch(command, commandArgs, logger));
  }
  return withTelemetry({
    command: command!,
    reporter,
    run: effectiveReporter =>
      dispatch(command, commandArgs, logger, effectiveReporter),
  });
}

function toExitCode(result: CommandRunResult): number {
  return typeof result === 'number' ? result : result.exitCode;
}

async function dispatch(
  command: string | undefined,
  commandArgs: string[],
  logger: ILogger,
  reporter: ITelemetryReporter = NoopTelemetryReporter
): Promise<CommandRunResult> {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    logger.info(renderCliHelp());
    return 0;
  }

  if (command === '--version' || command === '-v') {
    logger.info(__CLI_VERSION__);
    return 0;
  }

  if (command !== 'mcp') {
    logger.error(`Unknown command "${command}".\n\n${renderCliHelp()}`);
    return 1;
  }

  if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
    logger.info(MCP_HELP);
    return 0;
  }

  try {
    return await runMcpCommand(
      parseMcpArgs(commandArgs),
      logger,
      reporter.forComponent('mcp', { autoFlush: { maxQueueSize: 10 } })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(message);
    if (process.env.FOAM_DEBUG && stack) logger.error(stack);
    return {
      exitCode: 1,
      telemetryProperties: {
        errorType:
          error instanceof Error ? error.constructor.name : 'UnknownError',
        errorContext: 'dispatch',
      },
    };
  }
}

async function main(): Promise<void> {
  Logger.setLevel('info');
  const argv = process.argv.slice(2);
  const [command, ...commandArgs] = argv;
  const reporter = await resolveCliReporter({
    command,
    commandArgs,
    buildReporter: installationId =>
      new AppInsightsReporter({
        connectionString: TELEMETRY_CONNECTION_STRING,
        component: 'cli',
        componentVersion: __CLI_VERSION__,
        coreVersion: __CORE_VERSION__,
        poster: httpsPoster,
        installationId,
      }),
  });

  process.exitCode = await runCli(argv, undefined, reporter);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
