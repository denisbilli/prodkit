import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
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
  const djangoPublicSignals = await searchInFiles(
    ctx.root,
    source,
    [
      /static\s*\(\s*settings\.MEDIA_URL/i,
      /document_root\s*=/i,
      /re_path\s*\(\s*r?['"][^'"]*media/i,
      /url\s*\(\s*r?['"][^'"]*media/i,
    ],
    15
  );

  /**
   * Django's own way of protecting a view: a decorator or a mixin, not middleware on a
   * route. The Express-shaped route scan cannot see either, so a project whose upload
   * view is `@login_required` read as having no protection at all.
   */
  const djangoProtectionSignals = await searchInFiles(
    ctx.root,
    source,
    [
      /@login_required/,
      /LoginRequiredMixin/,
      /PermissionRequiredMixin/,
      /@user_passes_test/,
      /@permission_required/,
    ],
    15
  );

  for (const m of djangoProtectionSignals) {
    evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'protection' });
  }
  const validationSignals = await searchInFiles(
    ctx.root,
    source,
    [/file-type/i, /mime/i, /content-type/i],
    15
  );

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
