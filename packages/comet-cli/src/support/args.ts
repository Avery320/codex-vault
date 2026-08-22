export interface ParsedArgs {
  options: Map<string, string | boolean>;
  positionals: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const options = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const [name, inlineValue] = arg.slice(2).split('=', 2);
      if (inlineValue !== undefined) {
        options.set(name, inlineValue);
      } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) {
        options.set(name, argv[++i]);
      } else {
        options.set(name, true);
      }
    } else if (arg === '-h') {
      options.set('help', true);
    } else {
      positionals.push(arg);
    }
  }

  return { options, positionals };
}

export function getString(
  parsed: ParsedArgs,
  name: string
): string | undefined {
  const value = parsed.options.get(name);
  return typeof value === 'string' ? value : undefined;
}

export function getFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.options.get(name) === true;
}

export function resolveWorkspaceDir(parsed: ParsedArgs): string {
  return (
    getString(parsed, 'workspace') ??
    process.env.COMET_WORKSPACE ??
    process.cwd()
  );
}
