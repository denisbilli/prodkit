import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { proseLines } from '../src/analyzer/proseLines';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Prose read as code, in the one language where the comment filter cannot see it.
 *
 * This analyzer has skipped comments since the day it read its own sentences about
 * Stripe as evidence that it takes payments. The rule looks for a line marker — `#`,
 * `//`, `/*`, `<!--` — and a Python docstring has none: it is a string, and its
 * interior lines begin with whatever the author was saying.
 *
 * Measured across the corpus: 118 of 1587 citations from Python files landed inside
 * one. `/api/auth/...  registrazione + JWT` was cited as evidence of an
 * authentication route, and `Chi arriva col link (?k=...) si vede posare un cookie`
 * as evidence about cookies. Sentences describing the code, offered as the code.
 */
describe('a docstring is prose, and prose is not evidence', () => {
  const text = fs.readFileSync(path.join(fixture('docstring-is-not-code'), 'app/views.py'), 'utf8');

  it('marks the lines of a module docstring', () => {
    const prose = proseLines('app/views.py', text);

    // "/api/auth/... registrazione + JWT" is line 4, inside the module docstring.
    expect(prose.has(4)).toBe(true);
    expect(prose.has(6)).toBe(true);
  });

  it('marks a function docstring too', () => {
    const prose = proseLines('app/views.py', text);

    expect(prose.has(18)).toBe(true);
  });

  it('leaves a triple-quoted string assigned to a name readable', () => {
    // `PAGE_TEMPLATE = """..."""` is data, not prose, and a hardcoded secret can live
    // in one. A docstring is an expression statement with nothing before it.
    const prose = proseLines('app/views.py', text);

    expect(prose.has(12)).toBe(false);
    expect(prose.has(13)).toBe(false);
  });

  it('leaves code alone', () => {
    const prose = proseLines('app/views.py', text);

    expect(prose.has(9)).toBe(false);
    expect(prose.has(19)).toBe(false);
  });

  it('applies to Python and nothing else', () => {
    expect(proseLines('app/views.ts', text).size).toBe(0);
  });

  it('cites nothing from inside the docstring of a real analysis', async () => {
    const analysis = await analyzeProject(fixture('docstring-is-not-code'));
    const cited = Object.values(analysis.detectors)
      .flatMap((detector) => detector.evidence ?? [])
      .filter((item) => item.type === 'snippet');

    for (const item of cited) {
      expect(String(item.value)).not.toContain('registrazione + JWT');
      expect(String(item.value)).not.toContain('si vede posare un cookie');
    }
  });
})
