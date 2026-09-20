import type * as TypeScriptApi from 'typescript';
import { readTextFileSafe } from '../../utils/readTextFileSafe';
import { loadTypeScript } from './loadTypeScript';

/**
 * A route handler comparing a field of something it fetched against a field of the
 * caller.
 *
 * This is the one capability on the list with no package to anchor on. There is no
 * `npm install authorization`: ownership is written by hand, in whatever words the
 * author has, and every reading of it here was a list of those words — `ownerId`,
 * `createdBy`, `req.user.id`. An Italian application guarding every route with
 *
 *     if (nota.proprietario !== richiesta.utente.id) return risposta.sendStatus(404);
 *
 * was told it had no per-record checks, under a recommendation to add the thing it
 * already had.
 *
 * The anchor that survives is the framework's contract. `express()` and
 * `express.Router()` come from a package; a router's `.get(path, handler)` is Express
 * saying "this is a request handler"; and the handler's first parameter is the
 * request, whatever its author called it. From there the question is structural and
 * needs no vocabulary at all: does this handler compare a property reached through
 * that parameter against a property of something else?
 *
 * `nota.proprietario !== richiesta.utente.id` answers yes. `richiesta.method !== 'GET'`
 * does not — the other side is a literal, and comparing the request to a constant is
 * routing, not authorisation. Neither does a comparison with the request on both
 * sides, which is a request talking to itself rather than to a row.
 */

const READABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Express methods that take a handler whose first parameter is the request. */
const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);

export interface OwnershipCheck {
  file: string;
  line: number;
  snippet: string;
}

function expressBindings(ts: typeof TypeScriptApi, source: TypeScriptApi.SourceFile): Set<string> {
  const fromPackage = new Set<string>();
  const routers = new Set<string>();

  const visit = (node: TypeScriptApi.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier) && node.moduleSpecifier.text === 'express') {
      if (node.importClause?.name) fromPackage.add(node.importClause.name.text);
    }

    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const initializer = node.initializer;

      /** `const express = require('express')` */
      if (
        ts.isCallExpression(initializer)
        && ts.isIdentifier(initializer.expression)
        && initializer.expression.text === 'require'
        && initializer.arguments.length === 1
        && ts.isStringLiteralLike(initializer.arguments[0])
        && initializer.arguments[0].text === 'express'
      ) {
        fromPackage.add(node.name.text);
      }

      /** `const app = express()` and `const rotte = express.Router()` */
      if (ts.isCallExpression(initializer)) {
        const callee = initializer.expression;
        if (ts.isIdentifier(callee) && fromPackage.has(callee.text)) routers.add(node.name.text);
        if (
          ts.isPropertyAccessExpression(callee)
          && callee.name.text === 'Router'
          && ts.isIdentifier(callee.expression)
          && fromPackage.has(callee.expression.text)
        ) {
          routers.add(node.name.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return routers;
}

/** The identifier a property access is reached through: `a.b.c` is rooted at `a`. */
function rootOf(ts: typeof TypeScriptApi, node: TypeScriptApi.Expression): string | null {
  let current: TypeScriptApi.Expression = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : null;
}

function isPropertyPath(ts: typeof TypeScriptApi, node: TypeScriptApi.Expression): boolean {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
}

export async function readOwnershipChecks(
  root: string,
  files: string[],
): Promise<OwnershipCheck[] | null> {
  const ts = await loadTypeScript();
  if (!ts) return null;

  const checks: OwnershipCheck[] = [];

  for (const file of files) {
    if (!READABLE.test(file)) continue;
    const text = await readTextFileSafe(root, file);
    if (!text) continue;
    if (!text.includes('express')) continue;

    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const routers = expressBindings(ts, source);
    if (routers.size === 0) continue;

    const lines = text.split(/\r?\n/);

    const visit = (node: TypeScriptApi.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const isRoute =
          ts.isPropertyAccessExpression(callee)
          && ROUTE_METHODS.has(callee.name.text)
          && ts.isIdentifier(callee.expression)
          && routers.has(callee.expression.text);

        if (isRoute) {
          for (const argument of node.arguments) {
            if (!ts.isArrowFunction(argument) && !ts.isFunctionExpression(argument)) continue;

            /**
             * The request's position, not its name. Express hands an error-first
             * middleware four parameters and puts the request second; every other
             * handler takes it first.
             */
            const parameters = argument.parameters;
            const request = parameters.length === 4 ? parameters[1] : parameters[0];
            if (!request || !ts.isIdentifier(request.name)) continue;
            const requestName = request.name.text;

            const inspect = (inner: TypeScriptApi.Node): void => {
              if (
                ts.isBinaryExpression(inner)
                && [
                  ts.SyntaxKind.EqualsEqualsEqualsToken,
                  ts.SyntaxKind.ExclamationEqualsEqualsToken,
                  ts.SyntaxKind.EqualsEqualsToken,
                  ts.SyntaxKind.ExclamationEqualsToken,
                ].includes(inner.operatorToken.kind)
              ) {
                const left = inner.left;
                const right = inner.right;
                const leftRoot = rootOf(ts, left);
                const rightRoot = rootOf(ts, right);
                const fromRequest = (root: string | null, side: TypeScriptApi.Expression) =>
                  root === requestName && isPropertyPath(ts, side);
                const fromElsewhere = (root: string | null, side: TypeScriptApi.Expression) =>
                  root !== null && root !== requestName && isPropertyPath(ts, side);

                const compares =
                  (fromRequest(leftRoot, left) && fromElsewhere(rightRoot, right))
                  || (fromRequest(rightRoot, right) && fromElsewhere(leftRoot, left));

                if (compares) {
                  const line = source.getLineAndCharacterOfPosition(inner.getStart(source)).line;
                  checks.push({ file, line: line + 1, snippet: (lines[line] ?? '').trim().slice(0, 200) });
                }
              }
              ts.forEachChild(inner, inspect);
            };

            if (argument.body) inspect(argument.body);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return checks;
}
