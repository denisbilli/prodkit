import type * as TypeScriptApi from 'typescript';
import { readTextFileSafe } from '../../utils/readTextFileSafe';
import { loadTypeScript } from './loadTypeScript';

/**
 * Lines that are entries in a lookup table rather than assignments.
 *
 * Ghost keeps a map of every setting to the group it belongs to:
 *
 *     admin_session_secret: 'core',
 *     theme_session_secret: 'core',
 *     members_email_auth_secret: 'core',
 *
 * Read as text this is a secret-named key assigned a short string, which is exactly
 * the shape of a hardcoded fallback — and Ghost was told it had a critical. Read as a
 * tree it is one property of an object with sixty of them, and what it says is "this
 * setting is in the core group".
 *
 * Nothing in the words tells the two apart. The table is visible only in the shape.
 */

/**
 * How many string-valued properties make an object a table.
 *
 * Low enough to catch a modest map, high enough that a small configuration object —
 * `{ secret: 'dev-secret', port: 3000 }`, which is a real finding — is not excused.
 * A genuine fallback secret sits in an object with a handful of siblings at most.
 */
const TABLE_SIZE = 8;

const READABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const MAX_READABLE_LINE = 500;

function tableLines(ts: typeof TypeScriptApi, file: string, text: string): Set<number> {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = new Set<number>();

  const visit = (node: TypeScriptApi.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const properties = node.properties.filter(ts.isPropertyAssignment);
      const stringValued = properties.filter(
        (property) => ts.isStringLiteral(property.initializer)
          || ts.isNoSubstitutionTemplateLiteral(property.initializer),
      );

      /**
       * Every property a string, and plenty of them. A mixed object — some strings,
       * some calls, some numbers — is configuration, and configuration is where a
       * fallback secret actually lives.
       */
      if (stringValued.length >= TABLE_SIZE && stringValued.length === properties.length) {
        for (const property of stringValued) {
          lines.add(source.getLineAndCharacterOfPosition(property.getStart(source)).line + 1);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return lines;
}

/**
 * Which lines of which files are table entries, or null when the question cannot be asked.
 *
 * `null` means the optional TypeScript dependency is absent, not that there are no
 * tables — the caller keeps whatever it found rather than discarding it.
 */
export async function readLookupTableLines(
  root: string,
  files: string[],
): Promise<Map<string, Set<number>> | null> {
  const ts = await loadTypeScript();
  if (!ts) return null;

  const found = new Map<string, Set<number>>();

  for (const file of files.filter((candidate) => READABLE.test(candidate))) {
    const text = await readTextFileSafe(root, file);
    if (!text || text.split(/\r?\n/).some((line) => line.length > MAX_READABLE_LINE)) continue;

    try {
      const lines = tableLines(ts, file, text);
      if (lines.size > 0) found.set(file, lines);
    } catch {
      // A file the parser refuses keeps whatever the text layer decided about it.
    }
  }

  return found;
}
