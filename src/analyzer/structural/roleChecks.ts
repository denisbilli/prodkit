import type * as TypeScriptApi from 'typescript';
import { readTextFileSafe } from '../../utils/readTextFileSafe';
import { loadTypeScript } from './loadTypeScript';

/**
 * Whether a comparison against a role decides something or displays something.
 *
 * Three separate patches were written for this in one day, each against a shape the
 * previous one did not cover: a chat transcript comparing `m.role` to `"assistant"`, a
 * game comparing `part.role` to `'leftGate'`, and JSX picking an icon from
 * `{m.role === 'editor' ? <Pencil /> : <Eye />}`. All three are the same question, and
 * text cannot ask it: does this comparison guard an action, or choose a label?
 *
 * A syntax tree can. A guard is a condition whose branch leaves — returns, throws, calls
 * `next()`, answers with a status. A label is a condition whose branches are values: a
 * string, an element, an emoji.
 */
export type RoleCheckKind = 'guard' | 'label';

export interface RoleCheck {
  file: string;
  line: number;
  snippet: string;
  kind: RoleCheckKind;
}

const READABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * The same line the text layer refuses to quote.
 *
 * A parser is happy to read a bundle of forty thousand characters on one line, and a
 * reader is not: the evidence would be a fragment of generated output nobody wrote. The
 * text search skips such a line; so does this, for the same reason and at the same
 * length.
 */
const MAX_READABLE_LINE = 500;

function isGenerated(text: string): boolean {
  return text.split(/\r?\n/).some((line) => line.length > MAX_READABLE_LINE);
}

/**
 * What a branch does when it refuses: the shapes that mean "and stop here".
 *
 * A `return` is not enough on its own. `if (role === 'assistant') { return 'Assistant'; }`
 * returns a label, and reading that as a guard put a chat transcript back where the
 * regexes had it. A refusal returns nothing, or returns the answer to a request; a label
 * returns a value.
 */
function leaves(ts: typeof TypeScriptApi, node: TypeScriptApi.Node): boolean {
  let found = false;

  const visit = (child: TypeScriptApi.Node): void => {
    if (found) return;

    if (ts.isThrowStatement(child)) {
      found = true;
      return;
    }

    if (ts.isReturnStatement(child)) {
      // `return;` stops. `return 'Assistant';` answers with a label.
      if (!child.expression || !isJustAValue(ts, child.expression)) {
        found = true;
      }
      return;
    }

    if (ts.isCallExpression(child)) {
      const text = child.expression.getText();
      // `next()`, `res.status(403)`, `abort()`, `redirect()` — an answer, not a value.
      if (/(^|\.)(next|abort|redirect|forbid|deny|unauthorized)$/i.test(text) || /\.status$/.test(text)) {
        found = true;
        return;
      }
    }

    ts.forEachChild(child, visit);
  };

  visit(node);
  return found;
}

/** A branch that is only a value: a string, an element, a number, an emoji. */
function isJustAValue(ts: typeof TypeScriptApi, node: TypeScriptApi.Node): boolean {
  return ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node)
    || ts.isTemplateExpression(node)
    || ts.isNumericLiteral(node)
    || ts.isJsxElement(node)
    || ts.isJsxSelfClosingElement(node)
    || ts.isJsxFragment(node);
}

function mentionsARole(ts: typeof TypeScriptApi, node: TypeScriptApi.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) return /^roles?$/i.test(node.name.getText());
  if (ts.isIdentifier(node)) return /^roles?$/i.test(node.getText());
  if (ts.isElementAccessExpression(node)) return /['"`]roles?['"`]/i.test(node.argumentExpression.getText());

  return false;
}

/**
 * Classifies every comparison against something called `role` in one file.
 *
 * Deliberately narrow: only `===`, `==`, `!==` and `!=` against a role, which is the
 * shape all three misreadings had. `roles.includes(x)` and `requireRole(...)` are
 * already unambiguous in text and need no tree.
 */
function readFile(
  ts: typeof TypeScriptApi,
  file: string,
  text: string,
): RoleCheck[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const checks: RoleCheck[] = [];

  const visit = (node: TypeScriptApi.Node): void => {
    if (
      ts.isBinaryExpression(node)
      && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]
        .includes(node.operatorToken.kind)
      && (mentionsARole(ts, node.left) || mentionsARole(ts, node.right))
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      const parent = node.parent;

      let kind: RoleCheckKind = 'label';

      if (parent && ts.isIfStatement(parent) && parent.expression === node) {
        kind = leaves(ts, parent.thenStatement) || (parent.elseStatement && leaves(ts, parent.elseStatement))
          ? 'guard'
          : 'label';
      } else if (parent && ts.isConditionalExpression(parent) && parent.condition === node) {
        // A ternary whose arms are both values is picking one. Anything else may act.
        kind = isJustAValue(ts, parent.whenTrue) && isJustAValue(ts, parent.whenFalse) ? 'label' : 'guard';
      } else if (parent && (ts.isJsxExpression(parent) || ts.isJsxAttribute(parent))) {
        kind = 'label';
      } else if (parent && ts.isReturnStatement(parent)) {
        // `return user.role === 'admin'` is a predicate somebody calls to decide.
        kind = 'guard';
      } else if (parent && (ts.isArrowFunction(parent) || ts.isParenthesizedExpression(parent))) {
        /**
         * `const canPublish = (member) => member.role === ROLE_EDITOR;`
         *
         * A function whose whole body is the comparison exists to be asked. Reading it
         * as a label lost the one real role check in a fixture written to contain
         * exactly one.
         */
        kind = 'guard';
      }

      checks.push({
        file,
        line: line + 1,
        snippet: node.getText(source).replace(/\s+/g, ' ').slice(0, 200),
        kind,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return checks;
}

/**
 * Reads role comparisons structurally, or returns null when it cannot.
 *
 * `null` is not "no roles found" — it is "this question was not asked", and the caller
 * falls back to searching text. The two answers must not be confused: one is evidence,
 * the other is silence, which is the distinction this whole product is built on.
 */
export async function readRoleChecks(
  root: string,
  files: string[],
  limit = 40,
): Promise<RoleCheck[] | null> {
  const ts = await loadTypeScript();
  if (!ts) return null;

  const readable = files.filter((file) => READABLE.test(file));
  if (readable.length === 0) return [];

  const checks: RoleCheck[] = [];

  for (const file of readable) {
    if (checks.length >= limit) break;

    const text = await readTextFileSafe(root, file);
    if (!text || isGenerated(text)) continue;

    try {
      checks.push(...readFile(ts, file, text));
    } catch {
      // A file the parser refuses is a file this reading does not cover. The text search
      // underneath still sees it.
    }
  }

  return checks.slice(0, limit);
}
