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

  for (const d of uploadDeps) evidence.push({ type: 'dependency', value: d });
  for (const d of pyUploadDeps) evidence.push({ type: 'dependency', value: d });
  for (const d of avDeps) evidence.push({ type: 'dependency', value: d });

  const routeSignals: UploadRouteSignal[] = [];
  for (const file of ctx.files.source) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text || !text.includes('/uploads')) continue;
    routeSignals.push(...findExpressUploadsRoutes(text, file));
  }

  const source = ctx.files.source;
  const djangoPublicSignals = await searchInFiles(
    ctx.root,
    source,
    [/MEDIA_ROOT/i, /MEDIA_URL/i],
    15
  );
  const validationSignals = await searchInFiles(
    ctx.root,
    source,
    [/file-type/i, /mime/i, /content-type/i],
    15
  );

  const protectedRoutes = routeSignals.filter((r) => r.protected);
  const unprotectedRoutes = routeSignals.filter((r) => !r.protected);

  for (const r of routeSignals) {
    evidence.push({ type: 'snippet', value: r.snippet, file: r.file, line: r.line });
  }
  for (const m of djangoPublicSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  for (const m of validationSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  const publicExposure = unprotectedRoutes.length > 0 || djangoPublicSignals.length > 0;

  return {
    key: 'uploads.exposure',
    present: uploadDeps.length > 0 || routeSignals.length > 0 || djangoPublicSignals.length > 0,
    complete: !publicExposure,
    evidence,
    details: {
      publicExposure,
      protectedUploads: protectedRoutes.length > 0,
      protectedUploadsSameRoute: protectedRoutes.length > 0,
      unprotectedUploadRoutes: unprotectedRoutes.length,
      validation: validationSignals.length > 0,
      antivirus: avDeps.length > 0,
    },
  };
}
