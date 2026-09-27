import type { DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';

/**
 * The Go packages that are a command line, and the files in them.
 *
 * miniflux ships `internal/cli/reset_password.go` and a `-export-user-feeds` flag.
 * Both are the operator's: the password is typed at a terminal on the server, and the
 * export is written for whichever user the operator names. Read as a product feature,
 * they gave a reader with no self-service reset a password reset, and an export the
 * person it describes cannot ask for.
 *
 * The anchor is the standard library, not the directory name: a package whose code
 * calls `flag.Parse()` reads its instructions from the command line. It is a command
 * line only if nothing in it answers a request — a small service keeps its flags and
 * its handlers in one `main` package, and those handlers are the product.
 */
export async function goCommandLineFiles(ctx: DetectContext): Promise<Set<string>> {
  const byDirectory = new Map<string, string[]>();
  for (const file of ctx.files.source) {
    if (!file.endsWith('.go')) continue;
    const directory = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
    const files = byDirectory.get(directory) ?? [];
    files.push(file);
    byDirectory.set(directory, files);
  }

  const commandLine = new Set<string>();
  for (const files of byDirectory.values()) {
    const texts = await Promise.all(files.map((file) => readTextFileSafe(ctx.root, file)));
    if (!texts.some((text) => text && /\bflag\.Parse\(\)/.test(text))) continue;
    if (texts.some((text) => text && /\bhttp\.ResponseWriter\b/.test(text))) continue;
    for (const file of files) commandLine.add(file);
  }
  return commandLine;
}

/**
 * Laravel's console commands, which Artisan runs for the operator.
 *
 * coolify's `app/Console/Commands/Cloud/ExportUsers.php` dumps every user of the hosted
 * service for its operators, and it was coolify's personal data export. A class that
 * extends `Illuminate\Console\Command` is run as `php artisan <name>` on the server; the
 * person whose data it touches never sees it. Symfony's console command is the same thing
 * under another namespace, and Laravel's is built on it.
 */
const CONSOLE_COMMAND_IMPORT = /^\s*use\s+(?:Illuminate\\Console\\Command|Symfony\\Component\\Console\\Command\\Command)\s*;/m;

export async function phpConsoleCommandFiles(ctx: DetectContext): Promise<Set<string>> {
  const commands = new Set<string>();
  for (const file of ctx.files.source.filter((f) => f.endsWith('.php'))) {
    const text = await readTextFileSafe(ctx.root, file);
    if (text && CONSOLE_COMMAND_IMPORT.test(text) && /\bextends\s+Command\b/.test(text)) commands.add(file);
  }
  return commands;
}
