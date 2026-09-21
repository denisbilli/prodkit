import { readTextFileSafe } from './readTextFileSafe';
import { testOnlyLines } from '../analyzer/developmentOnly';
import { proseLines } from '../analyzer/proseLines';
import { blockCommentLines } from '../analyzer/blockComments';

export interface TextMatch {
  file: string;
  line: number;
  snippet: string;
}

/**
 * A line that declares a pattern rather than doing anything.
 *
 * `/stripeCustomerId/i,` in a table of search patterns is a definition of what to look
 * for, not a use of Stripe. This analyzer, pointed at itself, read its own detector
 * tables as a payment integration, an authentication system and a set of security
 * headers, and awarded itself passing checks for all three — the fourth time in one
 * night that a string was mistaken for the thing it names.
 *
 * It is not a self-analysis quirk. Every linter, scanner, security tool and validation
 * library carries a table of the things it looks for, and all of them were being
 * credited with implementing their own subject matter.
 *
 * Deliberately narrow: a standalone regex literal in a list, or one assigned to a
 * constant. A line that both declares a pattern and does something with it is a use,
 * and is left alone.
 */
const PATTERN_DECLARATION = /^(?:const\s+\w+(?:\s*:[^=]+)?\s*=\s*)?\/(?:[^/\\]|\\.)+\/[gimsuy]*\s*[,;]?$/;
/**
 * A name given a type, rather than a value.
 *
 * pocketbase's report cited three lines for its cross-origin policy: `AllowedOrigins
 * []string` — a field in a Go struct — `var allowedOrigins []string` in the command
 * that parses the flag, and `allowedOrigins: Array<string>` in a generated `.d.ts`.
 * Not one of them is a decision about origins. The line that is,
 * `config.AllowedOrigins = []string{"*"}` twenty lines further down, was never
 * reached, so a reader was given three declarations to argue with instead of the
 * default that actually applies.
 *
 * It is the same rule as the regex table above, for the same reason: a declaration
 * says what a thing is, and this analyzer claims to say what the code does.
 *
 * The right-hand side has to look like a type, not a value, because `AllowOrigins:
 * config.AllowedOrigins,` is a use and reads almost identically. A type starts with a
 * capital or is one of the primitives, and carries no quotes, no call and no digits —
 * and an object-literal member ends in a comma, which a field signature does not.
 */
/**
 * `import SwiftUI` has the shape and is not a declaration of anything.
 *
 * A keyword followed by a capitalised word reads exactly like a field given a type,
 * and the first version of this rule hid every Swift and Kotlin import — which is how
 * the native toolkits are detected, so an iOS application lost its interface. The
 * statement keywords are excluded by name; `var`, `let` and `readonly` stay, because
 * those really do introduce a declaration.
 */
const STATEMENT_KEYWORD = /^(?:import|package|from|export|return|case|new|type|class|struct|interface|enum|func|fun|def|public|private|protected|internal|throw|throws|extends|implements|use|using|namespace|module|require|await|yield|delete|typeof|instanceof|in|is|as|if|else|for|while|switch|do|try|catch|finally|with|assert|raise|lambda|val|const)\b/;

const TYPE_DECLARATION = /^(?:var\s+|let\s+|readonly\s+)?\w+\??\s*(?::\s*|\s+)(?:\[\]|\*|Array<|Map<|\bstring\b|\bnumber\b|\bboolean\b|\bbool\b|\bany\b|\bunknown\b|\bvoid\b|[A-Z])[\w.<>\[\]|&\s]*;?$/;

/**
 * Prose about the code, rather than the code.
 *
 * A comment that mentions Stripe is somebody explaining Stripe. This file's own comment
 * above — written to explain why a pattern table is not a payment integration — was
 * itself being counted as evidence that this package takes payments.
 *
 * A signal that appears only in a comment was never evidence of behaviour, which is the
 * whole argument: the report cites a line and says "this is what your code does", and a
 * sentence about the code is not that.
 *
 * `#` is where this went wrong for a whole language. It opens a comment in Python, YAML
 * and shell, and in Rust `#[get("/alive")]` is the route itself — so every Rust
 * attribute was invisible to every search this analyzer makes. vaultwarden declares its
 * liveness endpoint that way and was told it has none; the same blindness covered
 * `#[post(...)]`, every derive and every `#[cfg]`.
 */
const COMMENT_LINE = /^(?:\/\/|\/\*|\*\/?|#(?![![])(?!!)|<!--|--\s)/;

/**
 * A table of strings is not a third rule, and that was a mistake worth recording.
 *
 * `'Use STRIPE_WEBHOOK_SECRET from configuration.',` is advice sitting in this tool's
 * remediation catalogue, and skipping standalone string entries removed it. It also
 * removed `'django.contrib.auth',` from an INSTALLED_APPS list — where a string in a
 * list is not a mention of the behaviour, it *is* the behaviour. Assessed checks on a
 * real Django project fell from thirty-three to ten and its score rose eight points for
 * being less legible.
 *
 * Nothing in the shape of the line tells the two apart, so the rule is not made.
 */
function declaresAType(trimmed: string): boolean {
  const withoutDeclarator = trimmed.replace(/^(?:var|let|readonly)\s+/, '');

  return !STATEMENT_KEYWORD.test(withoutDeclarator) && TYPE_DECLARATION.test(trimmed);
}

function declaresRatherThanDoes(line: string): boolean {
  const trimmed = line.trim();

  return COMMENT_LINE.test(trimmed) || PATTERN_DECLARATION.test(trimmed) || declaresAType(trimmed);
}

/**
 * Whether this line may be quoted back to the reader as something the code does.
 *
 * The rules above were reachable only through the file search, so any detector that
 * walked lines itself got none of them. The CORS middleware walk was one: it cited
 * `// app.use(cors({` from a route somebody had commented out, and — pointed at this
 * repository — cited this tool's own prose about the Express middleware and the
 * sentence in its remediation catalogue that advises replacing `cors()` defaults.
 * Three citations, none of them code that runs.
 */
export function isCitableLine(line: string): boolean {
  return line.length <= MAX_CITABLE_LINE && !declaresRatherThanDoes(line);
}

/**
 * The longest line this analyzer will cite.
 *
 * The product's promise is that every finding points at a line somebody can open and
 * argue with. A bundled `index-BVY8w6Ig.js` is one line of forty thousand characters:
 * the snippet shown is the first two hundred of it, which names no function, no file the
 * author wrote, and nothing they can change. Two repositories in the verification corpus
 * were citing exactly that, and one of them was the only evidence behind a claim about
 * their authorization model.
 *
 * Skipping the line rather than the file, because a file is not minified — a line is.
 * Real source stays well under this: of twelve thousand files analysed, eleven thousand
 * have no line over two hundred characters, and the few hundred above five hundred are
 * bundles, embedded data URIs and generated blobs.
 *
 * The cost is honest and small: a problem that exists only inside generated output is no
 * longer reported. That output is not what anybody edits, and a finding nobody can act
 * on is not worth the one it displaces.
 */
const MAX_CITABLE_LINE = 500;

/**
 * The lines of one already-read file that match, with the same hygiene the file
 * search applies: no comments, no pattern tables, no minified lines.
 *
 * Exported because a detector that has the text in hand should not have to choose
 * between re-reading the file and skipping those rules. The CORS branch made that
 * choice the wrong way: it tested the whole file for a header name and cited line 1
 * with the words "explicit origin handling" — a conclusion where a line was promised.
 */
export function matchLines(text: string, needles: Array<string | RegExp>, file = ''): TextMatch[] {
  const matches: TextMatch[] = [];
  const lines = text.split(/\r?\n/);
  /**
   * Rust keeps its unit tests in the file they test, so no path filter can exclude
   * them. windmill was reported with a `critical` hardcoded secret that was the
   * fixture of a test asserting the wrong secret is rejected.
   */
  const testOnly = testOnlyLines(file, text);
  /** A Python docstring is prose with no line marker to recognise it by. */
  const prose = proseLines(file, text);
  /** Code somebody switched off by wrapping it, which has no marker on its lines. */
  const commented = blockCommentLines(file, text);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (testOnly.has(i + 1) || prose.has(i + 1) || commented.has(i + 1)) continue;
    if (line.length > MAX_CITABLE_LINE) continue;
    if (declaresRatherThanDoes(line)) continue;
    for (const n of needles) {
      const hit = typeof n === 'string' ? line.includes(n) : n.test(line);
      if (hit) {
        matches.push({ file, line: i + 1, snippet: line.trim().slice(0, 200) });
        break;
      }
    }
  }
  return matches;
}

/**
 * Search a list of relative file paths for any of the given needles
 * (string or RegExp). Returns at most `limit` matches.
 */
/**
 * A budget counts answers, not candidates.
 *
 * Several detectors search with a cap and then filter what came back — the header
 * search drops lines that *read* a header rather than set one, the rate-limit search
 * drops a 429 this project received rather than issued. The cap was spent on the
 * candidates, so a repository with enough noise never handed the filter anything to
 * keep: seventy files reading `content-security-policy` filled a budget of twenty,
 * and the file setting one was never opened.
 *
 * Giving the filter to the search fixes it at the root. `keep` runs per match, and
 * only a match it keeps costs budget, so the limit means what it says — "up to this
 * many findings" — rather than "up to this many lines that might have been findings".
 */
export async function searchInFiles(
  root: string,
  files: string[],
  needles: Array<string | RegExp>,
  limit = 25,
  keep?: (match: TextMatch) => boolean,
): Promise<TextMatch[]> {
  const matches: TextMatch[] = [];
  for (const file of files) {
    if (matches.length >= limit) break;
    const text = await readTextFileSafe(root, file);
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    const testOnly = testOnlyLines(file, text);
    const prose = proseLines(file, text);
    const commented = blockCommentLines(file, text);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (testOnly.has(i + 1) || prose.has(i + 1) || commented.has(i + 1)) continue;
      if (line.length > MAX_CITABLE_LINE) continue;
      if (declaresRatherThanDoes(line)) continue;

      for (const n of needles) {
        const hit = typeof n === 'string' ? line.includes(n) : n.test(line);
        if (hit) {
          const match: TextMatch = { file, line: i + 1, snippet: line.trim().slice(0, 200) };
          if (!keep || keep(match)) matches.push(match);
          break;
        }
      }
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export function anyIncludes(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}
