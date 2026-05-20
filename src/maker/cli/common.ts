/**
 * Small CLI parsing helpers for taptap-maker.
 */

export interface ParsedArgs {
  command?: string;
  rest: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...tokens] = argv;
  const rest: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      rest.push(token);
      continue;
    }

    const raw = token.slice(2);
    const equalsIndex = raw.indexOf('=');
    if (equalsIndex >= 0) {
      flags[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }

    const next = tokens[index + 1];
    if (next && !next.startsWith('--')) {
      flags[raw] = next;
      index++;
    } else {
      flags[raw] = true;
    }
  }

  return {
    command,
    rest,
    flags,
  };
}

export function getStringFlag(
  flags: Record<string, string | boolean>,
  name: string
): string | undefined {
  const value = flags[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function isJsonMode(flags: Record<string, string | boolean>): boolean {
  return flags.json === true;
}

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}
