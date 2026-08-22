import {
  type ILogger,
  Logger,
  LogLevel,
  BaseLogger,
} from '@foam/core';
import { parseMcpArgs, MCP_HELP, runMcpCommand } from './commands/mcp';

declare const __CLI_VERSION__: string;

const CLI_HELP = `Usage: foam mcp [options]

Codex Vault uses this package only as its Node.js stdio MCP runtime.

Commands:
  mcp         Run the Codex Vault MCP server

Options:
  --help      Show help
  --version   Show the runtime version
`;

function renderCliHelp(): string {
  return CLI_HELP;
}

class ConsoleLogger extends BaseLogger {
  log(level: LogLevel, msg?: string, ...params: any[]): void {
    const formattedMsg = level === 'info' ? msg : `[${level}] ${msg}`;
    console[level](formattedMsg, ...params);
  }
}

async function runCli(
  argv: string[],
  logger: ILogger = new ConsoleLogger()
): Promise<number> {
  const [command, ...commandArgs] = argv;
  return dispatch(command, commandArgs, logger);
}

async function dispatch(
  command: string | undefined,
  commandArgs: string[],
  logger: ILogger
): Promise<number> {
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
    return await runMcpCommand(parseMcpArgs(commandArgs), logger);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(message);
    if (process.env.FOAM_DEBUG && stack) logger.error(stack);
    return 1;
  }
}

async function main(): Promise<void> {
  Logger.setLevel('info');
  process.exitCode = await runCli(process.argv.slice(2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
