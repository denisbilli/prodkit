/**
 * The lines of a C-family file that sit inside a block comment.
 *
 * The comment rule reads one line at a time and looks for a marker at its start:
 * a double slash, a slash-star, a lone star. A block comment written without a
 * leading star on every line has no marker to find, and neither does code that
 * somebody commented out by wrapping the whole thing. In AsteroidsJS a wrapped
 * `localStorage.setItem('highScores', ...)` was cited as evidence that the game
 * saves progress; the function it belongs to is switched off.
 *
 * It is the same defect the Python docstrings had, in the languages where the marker
 * usually is there and sometimes is not.
 *
 * Counting the delimiters is not enough, and measuring that was the point. A first
 * pass said 135 citations across the corpus, and the second example it offered was
 * live code: a glob like star-star-slash-star-dot-ts, and a slash-star inside a
 * shader string, both look like an opening. So this walks the file properly —
 * through single quotes, double quotes, template literals and line comments — and
 * only then decides.
 */

const C_FAMILY = /\.(ts|tsx|js|jsx|mjs|cjs|go|java|cs|rs|php|scala|kt|swift|c|cc|cpp|h)$/i;

export function blockCommentLines(file: string, text: string): Set<number> {
  const inside = new Set<number>();
  if (!C_FAMILY.test(file)) return inside;
  if (!text.includes('/*')) return inside;

  let line = 1;
  let state: 'code' | 'line-comment' | 'block-comment' | 'single' | 'double' | 'template' = 'code';
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    const next = text[i + 1];

    if (character === '\n') {
      line++;
      if (state === 'line-comment') state = 'code';
      if (state === 'single' || state === 'double') state = 'code';
      if (state === 'block-comment') inside.add(line);
      escaped = false;
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    switch (state) {
      case 'code':
        if (character === '/' && next === '/') { state = 'line-comment'; i++; }
        else if (character === '/' && next === '*') { state = 'block-comment'; i++; }
        else if (character === "'") state = 'single';
        else if (character === '"') state = 'double';
        else if (character === '`') state = 'template';
        break;
      case 'block-comment':
        if (character === '*' && next === '/') { state = 'code'; i++; }
        break;
      case 'single':
      case 'double':
      case 'template':
        if (character === '\\') escaped = true;
        else if (
          (state === 'single' && character === "'")
          || (state === 'double' && character === '"')
          || (state === 'template' && character === '`')
        ) {
          state = 'code';
        }
        break;
      default:
        break;
    }
  }

  return inside;
}
