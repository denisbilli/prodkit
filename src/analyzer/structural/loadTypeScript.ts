import type * as TypeScriptApi from 'typescript';

/**
 * The TypeScript compiler, loaded when something needs to read structure rather than text.
 *
 * This analyzer reads source as prose: it searches for words and reports what it finds.
 * That is why `/otp/i` matched `VarError::NotPresent`, why `memberId` matched
 * `ScopedMemberId` in a compiler's symbol table, and why a chat transcript
 * (`{m.role === "user" ? "Utente" : "Assistente"}`) was read as an authorization model.
 * Each was patched with a narrower pattern, and a narrower pattern is still a pattern.
 *
 * A syntax tree answers questions a regular expression cannot ask: whether a comparison
 * guards an action or picks a label, whether an identifier is a property or a string in
 * a table, whether a call is made or merely named.
 *
 * Optional, and loaded the way this package already loads the MCP SDK and the AI layer:
 * a variable specifier so the build does not require it, and a null return rather than a
 * throw when it is absent. Text search remains the floor. Structure is what a project
 * that has TypeScript installed — which is most projects with TypeScript in them — gets
 * on top.
 */
let cached: typeof TypeScriptApi | null | undefined;

const SPECIFIER = 'typescript';

export async function loadTypeScript(): Promise<typeof TypeScriptApi | null> {
  if (cached !== undefined) return cached;

  try {
    const loaded = (await import(/* webpackIgnore: true */ SPECIFIER)) as
      | typeof TypeScriptApi
      | { default: typeof TypeScriptApi };

    cached = 'createSourceFile' in loaded ? loaded : loaded.default;
  } catch {
    cached = null;
  }

  return cached;
}

/** For tests that need to observe both paths without reinstalling anything. */
export function resetTypeScriptCache(): void {
  cached = undefined;
}

/**
 * Pretend the compiler is not installed, for tests of what this analyzer says when it
 * cannot read structure.
 *
 * That path is the ordinary one for anybody running `npx prodkit` against their own
 * repository, and it went untested for as long as it existed because the test machine
 * always has the compiler. Mocking the module specifier does not work here: the import
 * is dynamic and resolves before the mock registry answers, so the first analysis in a
 * file quietly reads the real compiler. Seeding the same cache the loader reads is the
 * one seam that behaves identically to the real absence.
 */
export function pretendTypeScriptIsMissing(): void {
  cached = null;
}

/**
 * Whether the parser is there, for the report rather than for a reader.
 *
 * `readingDepths` printed `parsed` for every `.ts` and `.js` file on the strength of the
 * extension alone, and said nothing when everything was parsed — so on a machine without
 * the optional compiler the report was silent in exactly the case it needed to speak.
 * Measured on the fixture corpus: seven of a hundred and thirty-three repositories
 * answer differently with the compiler hidden, and one of them reports a hardcoded
 * signing secret as `passed`.
 */
export async function typeScriptIsAvailable(): Promise<boolean> {
  return (await loadTypeScript()) !== null;
}
