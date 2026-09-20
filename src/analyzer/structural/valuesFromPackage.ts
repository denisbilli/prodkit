import type * as TypeScriptApi from 'typescript';
import { readTextFileSafe } from '../../utils/readTextFileSafe';
import { loadTypeScript } from './loadTypeScript';

/**
 * Where a value that came out of a given package is used, whatever the author called it.
 *
 * Every search in this analyzer reads names, and a name is the one part of the code
 * its author chose freely. `const limiter = rateLimit(...)` is found because somebody
 * wrote "rateLimit"; the same protection written as
 *
 *     const thisIsFuckingTopUse = require('express-rate-limit');
 *     router.post('/login', thisIsFuckingTopUse({ max: 5 }), handler);
 *
 * is invisible, and the report downgrades a login that is in fact protected. That is
 * not a gap in a word list. It is the word list.
 *
 * The anchor here is the one name the author did not choose: the package specifier.
 * `express-rate-limit` is what the ecosystem calls it, and from that import the chain
 * is mechanical rather than guessed — the binding it is assigned to, the values that
 * binding produces when called, and every place those values are then used. Following
 * a binding is not a heuristic; it is what the language already means.
 *
 * TypeScript and JavaScript only, because that is where the parser reaches. Elsewhere
 * the floor is still text, and the reading-depth line in the report says so.
 */

const READABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function packageOf(ts: typeof TypeScriptApi, node: TypeScriptApi.Node): string | null {
  // `require('x')`
  if (
    ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === 'require'
    && node.arguments.length === 1
    && ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return null;
}

function bindingsFor(
  ts: typeof TypeScriptApi,
  source: TypeScriptApi.SourceFile,
  packages: ReadonlySet<string>,
): Set<string> {
  const bound = new Set<string>();

  const visit = (node: TypeScriptApi.Node): void => {
    /** `import x from 'pkg'`, and `import { y } from 'pkg'`. */
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      if (packages.has(node.moduleSpecifier.text)) {
        const clause = node.importClause;
        if (clause?.name) bound.add(clause.name.text);
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) bound.add(element.name.text);
        }
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          bound.add(clause.namedBindings.name.text);
        }
      }
    }

    /** `const x = require('pkg')`, and `const { y } = require('pkg')`. */
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const specifier = packageOf(ts, node.initializer);
      if (specifier && packages.has(specifier)) {
        if (ts.isIdentifier(node.name)) bound.add(node.name.text);
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (ts.isIdentifier(element.name)) bound.add(element.name.text);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return bound;
}

/**
 * Values produced by calling a binding, so `const limiter = rateLimit({...})` puts
 * `limiter` in the chain alongside `rateLimit` itself.
 *
 * One hop, deliberately. A factory that returns a factory is rare enough that chasing
 * it would add reach nobody has asked for, and every extra hop is another way to be
 * wrong about what a value is.
 */
function derivedFrom(
  ts: typeof TypeScriptApi,
  source: TypeScriptApi.SourceFile,
  roots: ReadonlySet<string>,
): Set<string> {
  const derived = new Set<string>();

  const visit = (node: TypeScriptApi.Node): void => {
    if (
      ts.isVariableDeclaration(node)
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression)
      && roots.has(node.initializer.expression.text)
      && ts.isIdentifier(node.name)
    ) {
      derived.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return derived;
}

export interface PackageValueUse {
  file: string;
  line: number;
  /**
   * The path it was mounted on, where the use is an argument to `use(path, value)`.
   *
   * `app.use('/api/', limiter)` covers everything mounted under `/api/`, including an
   * auth router registered three lines later. Reading that needs the mount path, and
   * the mount path is a string in the source rather than a name anybody chose.
   */
  mountPath?: string;
}

/** The `use(path, …)` this node sits inside, if any. */
function mountPathOf(ts: typeof TypeScriptApi, node: TypeScriptApi.Node): string | undefined {
  const call = node.parent;
  if (!call || !ts.isCallExpression(call)) return undefined;
  if (!call.arguments.some((argument) => argument === node)) return undefined;

  const callee = call.expression;
  const isUse = ts.isPropertyAccessExpression(callee) && callee.name.text === 'use';
  if (!isUse) return undefined;

  const [first] = call.arguments;
  return first && ts.isStringLiteralLike(first) ? first.text : undefined;
}

/**
 * Every line where a value that originated in one of `packages` is used.
 *
 * `null` when the parser is not installed, which is the same contract the other
 * structural readers keep: absent means "this question was not asked", and the caller
 * falls back to text.
 */
export async function readPackageValueUses(
  root: string,
  files: string[],
  packages: string[],
): Promise<PackageValueUse[] | null> {
  const ts = await loadTypeScript();
  if (!ts) return null;

  const wanted = new Set(packages);
  const uses: PackageValueUse[] = [];

  for (const file of files) {
    if (!READABLE.test(file)) continue;
    const text = await readTextFileSafe(root, file);
    if (!text) continue;
    if (!packages.some((name) => text.includes(name))) continue;

    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const roots = bindingsFor(ts, source, wanted);
    if (roots.size === 0) continue;

    const names = new Set([...roots, ...derivedFrom(ts, source, roots)]);

    const visit = (node: TypeScriptApi.Node): void => {
      if (ts.isIdentifier(node) && names.has(node.text)) {
        /**
         * A use, not a declaration. `const limiter = rateLimit(...)` names `limiter`
         * on the left and uses `rateLimit` on the right; only the second is a place
         * the protection is applied.
         */
        const parent = node.parent;
        const isDeclarationName =
          (parent && ts.isVariableDeclaration(parent) && parent.name === node)
          || (parent && ts.isImportSpecifier(parent))
          || (parent && ts.isImportClause(parent))
          || (parent && ts.isNamespaceImport(parent))
          || (parent && ts.isBindingElement(parent) && parent.name === node);

        if (!isDeclarationName) {
          uses.push({
            file,
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            mountPath: mountPathOf(ts, node),
          });
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return uses;
}
