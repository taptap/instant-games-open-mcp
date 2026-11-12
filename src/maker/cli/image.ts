import { compressPngFile } from '../image/compress.js';

export const IMAGE_CLI_USAGE =
  'taptap-maker image compress --input INPUT.png --output COPY.png [--json]';

export async function runImageCli(
  subcommand: string | undefined,
  options: Record<string, string | boolean>,
  positionals: string[]
): Promise<void> {
  try {
    if (subcommand !== 'compress' || positionals.length)
      throw new Error(`Usage: ${IMAGE_CLI_USAGE}`);
    for (const key of Object.keys(options)) {
      if (!['input', 'output', 'json'].includes(key))
        throw new Error(`Unknown image option: --${key}`);
    }
    if (
      typeof options.input !== 'string' ||
      !options.input.trim() ||
      typeof options.output !== 'string' ||
      !options.output.trim()
    )
      throw new Error(`Both --input and --output are required. Usage: ${IMAGE_CLI_USAGE}`);
    const result = await compressPngFile(options.input, options.output);
    process.stdout.write(
      options.json
        ? JSON.stringify(result, null, 2) + '\n'
        : `${result.status}: ${result.original_bytes} -> ${result.output_bytes} bytes\n${result.output_path}\n`
    );
  } catch (error) {
    if (!options.json) throw error;
    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: (error as NodeJS.ErrnoException).code || 'IMAGE_COMPRESSION_FAILED',
            message: error instanceof Error ? error.message : String(error),
          },
        },
        null,
        2
      ) + '\n'
    );
    process.exitCode = 1;
  }
}
