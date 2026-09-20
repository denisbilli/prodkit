import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { blockCommentLines } from '../src/analyzer/blockComments';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Code somebody switched off by wrapping it, cited as code that runs.
 *
 * The comment rule reads one line and looks for a marker at its start. A block
 * comment whose lines carry no leading star has none, and neither does a function
 * commented out whole. AsteroidsJS had its high-score saving wrapped that way and
 * the `localStorage.setItem` inside it was cited as evidence the game saves
 * progress; Olimpiadi2026 has its entire OpenAI call wrapped, and three lines of it
 * were cited.
 *
 * **Measured honestly, and the first measurement was wrong.** Counting the
 * delimiters said 135 citations across the corpus; the second example it offered
 * was live code, because a glob and a slash-star inside a string both look like an
 * opening. Walking the file properly says five. Five is what this fixes, and no
 * verdict in the corpus changes — the evidence gets truer and nothing else moves.
 * That is worth doing anyway: a reader who opens a cited line and finds a dead
 * block stops believing the rest of the page.
 */
describe('code somebody switched off is not code', () => {
  const text = fs.readFileSync(path.join(fixture('commented-out-model-call'), 'src/llm-helper.js'), 'utf8');

  it('knows a wrapped block from the code around it', () => {
    const commented = blockCommentLines('src/llm-helper.js', text);

    expect(commented.has(11)).toBe(true);
    expect(commented.has(4)).toBe(false);
  });

  it('is not fooled by a glob that looks like an opening', () => {
    // `'**/*.ts'` on line 1 contains a slash-star inside a string. Counting
    // delimiters made every line after it look commented.
    const commented = blockCommentLines('src/llm-helper.js', text);

    expect(commented.has(3)).toBe(false);
    expect(commented.has(19)).toBe(false);
  });

  it('applies to the C family and not to Python', () => {
    expect(blockCommentLines('a.py', text).size).toBe(0);
    expect(blockCommentLines('a.ts', text).size).toBeGreaterThan(0);
  });

  it('cites nothing from inside the wrapped call', async () => {
    const analysis = await analyzeProject(fixture('commented-out-model-call'));
    const cited = Object.values(analysis.detectors)
      .flatMap((detector) => detector.evidence ?? [])
      .filter((item) => item.type === 'snippet');

    for (const item of cited) {
      expect(String(item.value)).not.toContain('OPENAI_API_KEY');
      expect(String(item.value)).not.toContain('max_tokens');
    }
  });
})
