/**
 * The lines of a Python or Elixir file that are prose rather than code.
 *
 * This analyzer has skipped comments since the day it read its own prose about Stripe
 * as evidence that it takes payments. The rule looks for a line marker — `#`, `//`,
 * `/*`, `<!--` — and Python's main way of writing prose has none: a docstring is a
 * string, and its interior lines begin with whatever the author was saying.
 *
 * Measured across the corpus: 118 of 1587 citations from Python files land inside
 * one. `/api/auth/...  registrazione + JWT` was cited as evidence of an
 * authentication route; `Chi arriva col link (?k=...) si vede posare un cookie` as
 * evidence about cookies. Sentences describing the code, offered as the code.
 *
 * Only a block that stands on its own. `QUERY = """SELECT ..."""` is data assigned to
 * a name and a hardcoded secret could live in one, so a triple-quoted string on the
 * right of an assignment stays readable. A docstring is an expression statement and
 * has nothing before it but indentation.
 */
export function proseLines(file: string, text: string): Set<number> {
  if (/\.exs?$/i.test(file)) return elixirDocLines(text);

  const prose = new Set<number>();
  if (!/\.py$/i.test(file)) return prose;

  const lines = text.split(/\r?\n/);
  let openQuote: string | null = null;
  let openIsProse = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (openQuote) {
      if (openIsProse) prose.add(i + 1);
      if (line.includes(openQuote)) {
        openQuote = null;
        openIsProse = false;
      }
      continue;
    }

    const match = /("""|''')/.exec(line);
    if (!match) continue;

    const before = line.slice(0, match.index);
    /** An expression statement: nothing before the quotes but whitespace. */
    const standsAlone = /^\s*[rRbBuUfF]*$/.test(before);
    const rest = line.slice(match.index + 3);
    const closesOnThisLine = rest.includes(match[1]);

    if (standsAlone) prose.add(i + 1);
    if (closesOnThisLine) continue;

    openQuote = match[1];
    openIsProse = standsAlone;
  }

  return prose;
}

/**
 * Elixir writes its prose as a module attribute, and the rest is a heredoc.
 *
 * `@moduledoc """ ... """` is the same trap as a Python docstring with a different
 * marker: the interior lines begin with whatever the author was saying, and nothing
 * about them says they are not code. Phoenix generators put one at the top of every
 * controller, context and channel, so a repository has thousands.
 *
 * Anchored on Elixir's own attribute names — `@moduledoc`, `@doc`, `@typedoc`,
 * `@shortdoc` — rather than on the heredoc, because `@query """SELECT ..."""` is data
 * assigned to a name and a hardcoded secret could live in one. Same distinction the
 * Python reader draws, made by a different marker.
 */
function elixirDocLines(text: string): Set<number> {
  const prose = new Set<number>();
  const lines = text.split(/\r?\n/);
  let open = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (open) {
      prose.add(i + 1);
      if (/"""/.test(line)) open = false;
      continue;
    }

    const doc = /^\s*@(?:module|type|short)?doc\s+(?:~[A-Za-z])?"""/.exec(line);
    if (!doc) continue;

    prose.add(i + 1);
    /** A heredoc cannot close on its opening line, so the block is always open here. */
    open = true;
  }

  return prose;
}
