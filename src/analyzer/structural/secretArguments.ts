import type * as TypeScriptApi from 'typescript';
import { readTextFileSafe } from '../../utils/readTextFileSafe';
import { loadTypeScript } from './loadTypeScript';

/**
 * A literal reaching a parameter the library defines as a secret.
 *
 * Every other reading of "is this a hardcoded secret" starts from the name of the
 * thing being assigned — `JWT_SECRET`, `SECRET_KEY`, `API_KEY`. That name is the
 * author's, and an Italian application signing its tokens with
 *
 *     const chiave = process.env.CHIAVE_FIRMA || 'cambiami';
 *     jwt.sign({ sub: utente.id }, chiave);
 *
 * came back `passed`: "no weak fallback secret patterns detected", about a signing
 * key hardcoded in the source. The check congratulated it.
 *
 * The anchor that does not move is the other end. `jsonwebtoken.sign(payload, secret)`
 * says what its second argument is — that is the library's contract, not a convention
 * — and `crypto.createHmac(algorithm, key)` says the same. Whatever the value is
 * called on the way there, arriving there is what makes it a secret.
 *
 * One hop of resolution, matching the rest of the structural readers: a literal
 * passed directly, or an identifier declared in the same file whose initializer is a
 * literal or falls back to one. Two hops would reach further and be wrong more often,
 * and the text search remains underneath either way.
 */

const READABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Where a library says a secret goes: the package, the call, and which argument. */
interface SecretSink {
  package: string;
  method?: string;
  argument?: number;
  /** For APIs that take the secret as a named option rather than a position. */
  option?: string;
}

const SECRET_SINKS: SecretSink[] = [
  { package: 'jsonwebtoken', method: 'sign', argument: 1 },
  { package: 'jsonwebtoken', method: 'verify', argument: 1 },
  { package: 'crypto', method: 'createHmac', argument: 1 },
  { package: 'node:crypto', method: 'createHmac', argument: 1 },
  { package: 'crypto', method: 'createCipheriv', argument: 1 },
  { package: 'node:crypto', method: 'createCipheriv', argument: 1 },
  { package: 'express-session', option: 'secret' },
  { package: 'cookie-session', option: 'secret' },
  { package: 'iron-session', option: 'password' },
];

export interface HardcodedSecretArgument {
  file: string;
  line: number;
  snippet: string;
  /** The call that defines this value as a secret, for the sentence shown to a reader. */
  sink: string;
}

function bindingsFor(
  ts: typeof TypeScriptApi,
  source: TypeScriptApi.SourceFile,
  specifier: string,
): Set<string> {
  const bound = new Set<string>();

  const visit = (node: TypeScriptApi.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text === specifier) {
        const clause = node.importClause;
        if (clause?.name) bound.add(clause.name.text);
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) bound.add(clause.namedBindings.name.text);
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) bound.add(element.name.text);
        }
      }
    }

    if (
      ts.isVariableDeclaration(node)
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression)
      && node.initializer.expression.text === 'require'
      && node.initializer.arguments.length === 1
      && ts.isStringLiteralLike(node.initializer.arguments[0])
      && node.initializer.arguments[0].text === specifier
    ) {
      if (ts.isIdentifier(node.name)) bound.add(node.name.text);
      if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name)) bound.add(element.name.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return bound;
}

/** The literal an expression is, or falls back to, following one declaration. */
function literalBehind(
  ts: typeof TypeScriptApi,
  source: TypeScriptApi.SourceFile,
  expression: TypeScriptApi.Expression,
): boolean {
  if (ts.isStringLiteralLike(expression)) return true;

  if (
    ts.isBinaryExpression(expression)
    && (expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
      || expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    return literalBehind(ts, source, expression.right);
  }

  if (ts.isIdentifier(expression)) {
    let found = false;
    const visit = (node: TypeScriptApi.Node): void => {
      if (
        !found
        && ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.name.text === expression.text
        && node.initializer
        && !ts.isIdentifier(node.initializer)
      ) {
        found = literalBehind(ts, source, node.initializer);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  }

  return false;
}

export async function readHardcodedSecretArguments(
  root: string,
  files: string[],
): Promise<HardcodedSecretArgument[] | null> {
  const ts = await loadTypeScript();
  if (!ts) return null;

  const found: HardcodedSecretArgument[] = [];

  for (const file of files) {
    if (!READABLE.test(file)) continue;
    const text = await readTextFileSafe(root, file);
    if (!text) continue;
    if (!SECRET_SINKS.some((sink) => text.includes(sink.package.replace('node:', '')))) continue;

    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    for (const sink of SECRET_SINKS) {
      const bound = bindingsFor(ts, source, sink.package);
      if (bound.size === 0) continue;

      const visit = (node: TypeScriptApi.Node): void => {
        if (ts.isCallExpression(node)) {
          const callee = node.expression;
          const named = sink.method
            ? ts.isPropertyAccessExpression(callee)
              && callee.name.text === sink.method
              && ts.isIdentifier(callee.expression)
              && bound.has(callee.expression.text)
            : ts.isIdentifier(callee) && bound.has(callee.text);

          if (named) {
            const report = (expression: TypeScriptApi.Expression): void => {
              if (!literalBehind(ts, source, expression)) return;
              const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
              found.push({
                file,
                line: line + 1,
                snippet: (text.split(/\r?\n/)[line] ?? '').trim().slice(0, 200),
                sink: sink.method ? `${sink.package}.${sink.method}()` : `${sink.package}()`,
              });
            };

            if (sink.argument !== undefined) {
              const argument = node.arguments[sink.argument];
              if (argument) report(argument);
            }

            if (sink.option) {
              for (const argument of node.arguments) {
                if (!ts.isObjectLiteralExpression(argument)) continue;
                for (const property of argument.properties) {
                  if (
                    ts.isPropertyAssignment(property)
                    && ts.isIdentifier(property.name)
                    && property.name.text === sink.option
                  ) {
                    report(property.initializer);
                  }
                }
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(source);
    }
  }

  return found;
}

/**
 * Whether this reader would have had anything to read.
 *
 * `unanswered` has to mean "the answer depends on the reader that did not run", not
 * "a reader did not run". The first version marked every JavaScript repository in the
 * corpus — 79 of 133 — as not assessed for weak secrets, including the ones where a
 * plain `const JWT_SECRET = 'changeme'` is found by name and the sink-following reader
 * would have added nothing.
 *
 * The reader's own first act is this test: a file that never mentions a signing or
 * ciphering package has no sink to follow. Where no file does, the missing compiler
 * costs nothing and the text answer stands on its own.
 */
export async function anyFileReachesASecretSink(root: string, files: string[]): Promise<boolean> {
  for (const file of files) {
    if (!READABLE.test(file)) continue;
    const text = await readTextFileSafe(root, file);
    if (!text) continue;
    if (SECRET_SINKS.some((sink) => text.includes(sink.package.replace('node:', '')))) return true;
  }

  return false;
}
