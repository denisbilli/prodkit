import { readFileSync } from 'fs';
import * as path from 'path';

/**
 * Read the version from the manifest instead of hard-coding it.
 *
 * This string is stamped into every report and into the MCP handshake, so a
 * constant that has to be edited in step with `npm version` drifts silently:
 * 0.2.1 shipped to npm still telling users it was 0.2.0. The manifest sits one
 * directory above both the compiled file (dist/version.js) and the source file
 * (src/version.ts), so the same relative path works in a build, in a test run,
 * and in an installed package.
 */
function readVersion(): string {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8')
    );
    if (parsed && typeof parsed === 'object' && typeof (parsed as { version?: unknown }).version === 'string') {
      return (parsed as { version: string }).version;
    }
  } catch {
    // Fall through: a missing or unreadable manifest must not stop an analysis.
  }
  return '0.0.0-unknown';
}

export const PRODKit_VERSION = readVersion();
