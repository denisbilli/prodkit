import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

export async function detectUploads(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const uploadDeps = hasAnyDep(ctx, ['multer', 'formidable', '@aws-sdk/client-s3', 'aws-sdk']);
  const pyUploadDeps = hasAnyPyDep(ctx, ['boto3']);
  const avDeps = hasAnyDep(ctx, ['clamav', 'clamscan']);

  for (const d of uploadDeps) evidence.push({ type: 'dependency', value: d });
  for (const d of pyUploadDeps) evidence.push({ type: 'dependency', value: d });
  for (const d of avDeps) evidence.push({ type: 'dependency', value: d });

  const source = ctx.files.source;
  const publicSignals = await searchInFiles(
    ctx.root,
    source,
    [/express\.static\(\s*['\"][^'\"]*uploads/i, /app\.use\(\s*['\"]\/uploads/i, /MEDIA_ROOT/i, /MEDIA_URL/i],
    15
  );
  const protectedSignals = await searchInFiles(
    ctx.root,
    source,
    [/requireAuth/i, /requireRole/i, /permission_classes/i],
    20
  );
  const validationSignals = await searchInFiles(
    ctx.root,
    source,
    [/file-type/i, /mime/i, /content-type/i],
    15
  );
  for (const m of publicSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  for (const m of validationSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  return {
    key: 'uploads.exposure',
    present: uploadDeps.length > 0 || publicSignals.length > 0,
    complete: publicSignals.length === 0 || protectedSignals.length > 0,
    evidence,
    details: {
      publicExposure: publicSignals.length > 0,
      protectedUploads: protectedSignals.length > 0,
      validation: validationSignals.length > 0,
      antivirus: avDeps.length > 0,
    },
  };
}
