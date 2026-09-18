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
