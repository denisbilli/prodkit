import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import type { TextMatch } from '../utils/textSearch';
import { matchLines } from '../utils/textSearch';
import { readTextFileSafe } from '../utils/readTextFileSafe';

interface UploadRouteSignal {
  file: string;
  line: number;
  snippet: string;
  protected: boolean;
}

function getLineNumber(text: string, offset: number): number {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function findExpressUploadsRoutes(text: string, file: string): UploadRouteSignal[] {
  const out: UploadRouteSignal[] = [];
  const routeRegex = /app\.use\(\s*['"]\/uploads['"][\s\S]{0,260}?express\.static\([^)]*\)\s*\)/g;
  const protectionRegex = /requireAuth|authMiddleware|requireRole|requirePermission|permission/i;

  for (const match of text.matchAll(routeRegex)) {
    const snippet = (match[0] ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!snippet) continue;
    const index = match.index ?? 0;
    out.push({
      file,
      line: getLineNumber(text, index),
      snippet,
      protected: protectionRegex.test(match[0] ?? ''),
    });
  }

  return out;
}


/**
 * The lines of a Python file that only run in development.
 *
 * `urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)` is the
 * line Django's own documentation gives for serving uploaded files, and the
 * documentation wraps it in `if settings.DEBUG:` — which is the whole point of the
 * snippet. This detector already said so in a comment and then counted the line anyway,
 * so a travel application was told its uploads were exposed to the public by a line
 * that does not run in production.
 *
 * Block extent by indentation, which is how Python says it.
 */
function debugOnlyLines(text: string): Set<number> {
  const guarded = new Set<number>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const opener = lines[i].match(/^(\s*)if\s+(?:settings\.)?DEBUG\s*:/);
    if (!opener) continue;
    const indent = opener[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') { guarded.add(j + 1); continue; }
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= indent) break;
      guarded.add(j + 1);
    }
  }
  return guarded;
}

/**
 * A URL pattern that serves uploaded files, as distinct from one that serves the
 * stylesheet.
 *
 * `document_root=` alone matched `static(settings.STATIC_URL, document_root=STATIC_ROOT)`
 * — CSS and JavaScript, which every Django project serves and nobody uploads. Two of
 * the projects reported as exposing their uploads were exposing their stylesheets.
 */
const DJANGO_MEDIA_ROUTES = [
  /static\s*\(\s*settings\.MEDIA_URL/i,
  /document_root\s*=\s*settings\.MEDIA_ROOT/i,
  /re_path\s*\(\s*r?['"][^'"]*media/i,
  /url\s*\(\s*r?['"][^'"]*media/i,
];

/**
 * Checking the type of a file somebody uploaded.
 *
 * This was `/mime/i` and `/content-type/i`, which is every JSON response header in
 * every project: `res.writeHead(404, { 'Content-Type': 'application/json' })` was
 * cited as upload validation, and so was `X-Content-Type-Options: nosniff`. The flag
 * came out true for all six projects in the corpus that handle uploads — a measurement
 * that never varies is not one — and it decides whether upload protection reads
 * `present` or `partial`, so two projects were credited for a header on a 404.
 */
const DJANGO_VIEW_PROTECTION = [
  /@login_required/,
  /LoginRequiredMixin/,
  /PermissionRequiredMixin/,
  /@user_passes_test/,
  /@permission_required/,
];

/** A file that does something with an uploaded file, rather than one that logs people in. */
const HANDLES_FILES = /request\.FILES|FileField|ImageField|\bupload/i;

const UPLOAD_VALIDATION = [
  /\bfileFilter\b/,
  /file\.mimetype/i,
  /files?\[[^\]]*\]\.mimetype/i,
  /allowed(?:File|Mime|Content)?_?(?:Types|Extensions)/i,
  /FileExtensionValidator/,
  /validate_image_file_extension/,
  /\bfileTypeFrom(?:Buffer|File|Stream)\b/,
  /request\.FILES\[[^\]]*\]\.content_type/,
  /\.content_type\s*(?:not\s+)?in\b/,
];

export async function detectUploads(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const uploadDeps = hasAnyDep(ctx, ['multer', 'formidable', '@aws-sdk/client-s3', 'aws-sdk']);
  const pyUploadDeps = hasAnyPyDep(ctx, ['boto3']);
  const avDeps = hasAnyDep(ctx, ['clamav', 'clamscan']);

  /**
   * Each line tagged with the claim it supports.
   *
   * Everything this detector finds used to land in one array, so a report that said "no
   * upload handling was found in this repository" cited six snippets under it — five of
   * them `LoginRequiredMixin` and `@login_required`, one a PDF content type — and was
   * stamped "confidence: high, evidence quality: strong" for them. That a project has
   * authentication is why an upload check would matter; it is not evidence about
   * uploads, and the rate-limit rule already carries that sentence for the same reason.
   */
  for (const d of uploadDeps) evidence.push({ type: 'dependency', value: d, claim: 'uploads' });
  for (const d of pyUploadDeps) evidence.push({ type: 'dependency', value: d, claim: 'uploads' });
  for (const d of avDeps) evidence.push({ type: 'dependency', value: d, claim: 'antivirus' });

  const routeSignals: UploadRouteSignal[] = [];
  for (const file of ctx.files.source) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text || !text.includes('/uploads')) continue;
    routeSignals.push(...findExpressUploadsRoutes(text, file));
  }

  const source = ctx.files.source;

  /**
   * Django media served to the public, which is a route and not a setting.
   *
   * This matched `MEDIA_URL` and `MEDIA_ROOT` — two lines in settings.py that say where
   * uploaded files live on disk and under which prefix they *would* be served. Neither
   * serves anything. Django exposes them only when a URL pattern says so, and the
   * idiomatic one is wrapped in `if settings.DEBUG`.
   *
   * A real report on a real school platform called its uploads publicly exposed on the
   * strength of those two lines, with no pattern serving media anywhere in the project.
   */
  const djangoPublicSignals: TextMatch[] = [];
  const djangoProtectionSignals: TextMatch[] = [];
  const validationSignals: TextMatch[] = [];

  for (const file of source) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text) continue;

    validationSignals.push(...matchLines(text, UPLOAD_VALIDATION, file));

    if (!file.endsWith('.py')) continue;

    const developmentOnly = debugOnlyLines(text);
    djangoPublicSignals.push(
      ...matchLines(text, DJANGO_MEDIA_ROUTES, file).filter((m) => !developmentOnly.has(m.line)),
    );

    /**
     * Django's own way of protecting a view: a decorator or a mixin, not middleware on
     * a route. The Express-shaped route scan cannot see either, so a project whose
     * upload view is `@login_required` read as having no protection at all.
     *
     * Only in a file that handles files. This detector argues, three comments above,
     * that authentication is not evidence about uploads — and then counted every
     * `@login_required` in the project as upload protection: a photography business
     * was credited for the decorators on its accounting views.
     */
    if (HANDLES_FILES.test(text)) {
      djangoProtectionSignals.push(...matchLines(text, DJANGO_VIEW_PROTECTION, file));
    }
  }

  for (const m of djangoProtectionSignals) {
    evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'protection' });
  }

  const protectedRoutes = routeSignals.filter((r) => r.protected);
  const unprotectedRoutes = routeSignals.filter((r) => !r.protected);

  for (const r of routeSignals) {
    evidence.push({ type: 'snippet', value: r.snippet, file: r.file, line: r.line, claim: 'uploads' });
  }
  for (const m of djangoPublicSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'uploads' });
  for (const m of validationSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'validation' });

  const publicExposure = unprotectedRoutes.length > 0 || djangoPublicSignals.length > 0;
  const protectedSomehow = protectedRoutes.length > 0 || djangoProtectionSignals.length > 0;

  return {
    key: 'uploads.exposure',
    present: uploadDeps.length > 0 || routeSignals.length > 0 || djangoPublicSignals.length > 0,
    complete: !publicExposure,
    evidence,
    details: {
      publicExposure,
      protectedUploads: protectedSomehow,
      protectedUploadsSameRoute: protectedRoutes.length > 0,
      unprotectedUploadRoutes: unprotectedRoutes.length,
      validation: validationSignals.length > 0,
      antivirus: avDeps.length > 0,
    },
  };
}
