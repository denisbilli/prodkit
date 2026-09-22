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
 * An entry that says what something is called.
 *
 * appwrite ships a catalogue of function templates, and one line of it is
 * `'name' => 'ALLOWED_ORIGINS',` — an environment variable *the user's* function may
 * set, described in a table beside its placeholder and its help text. After the other
 * two citations were withdrawn it was carrying appwrite's whole `high` cross-origin
 * finding on its own, about a product whose real policy matches origins by hostname
 * and never answers with a wildcard.
 *
 * A string bound to `name`, `key`, `label` or `id` is what a thing is called. That is
 * not the same as a bare string in a list, which this file deliberately still reads —
 * `'django.contrib.auth',` in an INSTALLED_APPS array *is* the behaviour, and the
 * measurement that established it cost a real Django project eight points for being
 * legible. The difference is the key: one line says "this is called X", the other says
 * "X".
 */
const NAMES_SOMETHING = /^["']?(?:name|key|label|id|title|field|env|variable)["']?\s*(?:=>|:)\s*["'`][^"'`]+["'`],?$/i;

/**
 * A constant that spells its own name.
 *
 * photoprism keeps `AccessControlAllowOrigin = "Access-Control-Allow-Origin"` in
 * `pkg/http/header/cors.go`, beside three more of the same, and that table was the
 * whole evidence for its cross-origin finding — while
 * `c.Header(header.AccessControlAllowOrigin, header.Any)` in `start.go` and
 * `static.go`, the lines that actually open it, went uncited.
 *
 * A line whose value is its own identifier written out is a name for something, not a
 * use of it. It is the third member of a family this file already has: a regex in a
 * table is not a search, a name given a type is not a decision, and a header constant
 * is not a header.
 *
 * Compared after normalising case and separators, because that is the only difference
 * between the two halves — `ACCESS_CONTROL_ALLOW_ORIGIN`, `AccessControlAllowOrigin`
 * and `"access-control-allow-origin"` are one string spelled three ways. A trailing
 * comment is dropped first; Go puts the documentation link on the same line.
 */
/**
 * A header name, in the shape the protocol writes them.
 *
 * Radarr shortens its constants — `public const string AllowOrigin =
 * "Access-Control-Allow-Origin";` — so the two halves do not match and the
 * spells-its-own-name test says nothing. It is the same table: five lines naming five
 * headers, and the policy that matters is `builder.AllowAnyOrigin()` in `Startup.cs`,
 * two files away.
 *
 * Hyphenated capitalised words are how HTTP writes a header and almost nothing else
 * is written that way. It is required to be the whole value of a declaration, so a
 * line that *sends* one — `res.setHeader('Access-Control-Allow-Origin', origin)` —
 * has other arguments and is untouched.
 */
const HTTP_HEADER_NAME = /^[A-Z][A-Za-z0-9]*(?:-[A-Z][A-Za-z0-9]*)+$/;

function spellsItsOwnName(trimmed: string): boolean {
  const withoutComment = trimmed.replace(/\s*(\/\/|#).*$/, '').replace(/[,;]\s*$/, '');
  const assignment = /^(?:(?:public|private|protected|internal|export|const|let|var|final|static|readonly|string)\s+)*([A-Za-z_][\w.]*)\s*(?::\s*[\w<>[\].]+)?\s*=\s*(['"`])([^'"`]+)\2$/.exec(withoutComment);
  if (!assignment) return false;

  const plain = (value: string) => value.toLowerCase().replace(/[-_.\s]/g, '');
  const declared = /^\s*(?:public|private|protected|internal|export|const|let|var|final|static|readonly)\b/.test(withoutComment);

  return plain(assignment[1]) === plain(assignment[3])
    || (declared && HTTP_HEADER_NAME.test(assignment[3]));
}

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

const TYPE_DECLARATION = /^(?:var\s+|let\s+|readonly\s+)?\w+\??\s*(?::\s*|\s+)(?:\[\]|\*|Array<|Map<|\bstring\b|\bnumber\b|\bboolean\b|\bbool\b|\bany\b|\bunknown\b|\bvoid\b|[A-Z])[\w.<>[\]|&*\s]*;?$/;

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
/**
 * Two shapes the first version of this let through, both found in caddy.
 *
 * `allowedOrigins []*url.URL` is a struct field and the type is a pointer, which the
 * character class did not allow — so a declaration was cited as a cross-origin
 * decision. `AllowDomain []string // FIXME: this option is from legacy` is the same
 * thing with gitea's note after it, and the rule required the line to end at the
 * type.
 *
 * A trailing comment is dropped before the test, exactly as the self-naming rule
 * drops it, and `*` and `&` join the characters a type may be written with.
 */
function declaresAType(trimmed: string): boolean {
  const withoutComment = trimmed.replace(/\s*(?:\/\/|#).*$/, '').trimEnd();
  const withoutDeclarator = withoutComment.replace(/^(?:var|let|readonly)\s+/, '');

  return !STATEMENT_KEYWORD.test(withoutDeclarator) && TYPE_DECLARATION.test(withoutComment);
}

function declaresRatherThanDoes(line: string): boolean {
  const trimmed = line.trim();

  return COMMENT_LINE.test(trimmed) || PATTERN_DECLARATION.test(trimmed) || declaresAType(trimmed) || spellsItsOwnName(trimmed) || NAMES_SOMETHING.test(trimmed);
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
 * A placeholder is not a value.
 *
 * pocketbase was reported as having tenant boundaries — `passed`, which raises a
 * score — and the only two strong matches in its readable source were
 * `"Ex. https://login.microsoftonline.com/YOUR_DIRECTORY_TENANT_ID/oauth2/v2.0/authorize"`,
 * twice, in the help text of the form where somebody configures Microsoft sign-in.
 * Microsoft Entra calls its directory a tenant; the string is telling a reader where
 * to paste theirs. pocketbase has no organizations at all, and the rest of that
 * finding was Apple's developer `teamId`, a weak word that cannot stand alone.
 *
 * `YOUR_SOMETHING` is the convention for "replace this", in documentation, in example
 * configuration and in the help text beside a field. This analyzer already knows the
 * shape: `your[_-]?secret` has been in the weak-secret list since the beginning.
 *
 * The token around the match is what decides, not the line. A line may hold a
 * placeholder and a real value both, and only the matched one is being judged.
 */
const PLACEHOLDER_TOKEN = /^(?:your|my|sample|example|placeholder|changeme|todo|xxx+)[_-]/i;

function insideAPlaceholder(line: string, index: number, length: number): boolean {
  let start = index;
  while (start > 0 && /[A-Za-z0-9_-]/.test(line[start - 1])) start--;
  let end = index + length;
  while (end < line.length && /[A-Za-z0-9_-]/.test(line[end])) end++;

  return PLACEHOLDER_TOKEN.test(line.slice(start, end));
}

/**
 * Where a needle first matches, or -1. Shared so that both searches below judge a
 * match the same way.
 */
function findNeedle(line: string, needle: string | RegExp): { index: number; length: number } | null {
  if (typeof needle === 'string') {
    const index = line.indexOf(needle);
    return index === -1 ? null : { index, length: needle.length };
  }

  const found = new RegExp(needle.source, needle.flags.replace('g', '')).exec(line);
  return found ? { index: found.index, length: found[0].length } : null;
}

function matchesHere(line: string, needles: Array<string | RegExp>): boolean {
  for (const needle of needles) {
    const found = findNeedle(line, needle);
    if (found && !insideAPlaceholder(line, found.index, found.length)) return true;
  }

  return false;
}

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
    if (matchesHere(line, needles)) {
      matches.push({ file, line: i + 1, snippet: line.trim().slice(0, 200) });
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

      if (matchesHere(line, needles)) {
        const match: TextMatch = { file, line: i + 1, snippet: line.trim().slice(0, 200) };
        if (!keep || keep(match)) matches.push(match);
      }
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export function anyIncludes(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}
